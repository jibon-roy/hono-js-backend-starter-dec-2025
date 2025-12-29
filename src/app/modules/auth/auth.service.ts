import httpStatus from "http-status";
import crypto from "node:crypto";
import { addSeconds } from "date-fns";
import { UserRole } from "@prisma/client";

import ApiError from "../../../error/ApiErrors";
import prisma from "../../../shared/prisma";
import { redis } from "../../../lib/redisConnection";
import { jwtHelpers } from "../../../helpers/jwtHelpers";
import { config } from "../../../config";
import { comparePassword, hashPassword } from "../../../utils/passwordHelpers";
import { generateOTP } from "../../../utils/generateOtp";
import { OTP_EXPIRE_DURATION_MINUTES } from "../../../const";
import { otpQueue } from "../../../helpers/queue";
import type {
  AuthTokens,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailOtpInput,
} from "./auth.interface";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isUniqueConstraintError = (error: unknown) => {
  return Boolean((error as any)?.code === "P2002");
};

const getJwtSecret = () => {
  const secret = config.jwt.jwt_secret;
  if (!secret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: JWT_SECRET is not set"
    );
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = config.jwt.refresh_token_secret;
  if (!secret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: REFRESH_TOKEN_SECRET is not set"
    );
  }
  return secret;
};

const resolveExpiresIn = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
};

const parseExpiresInSeconds = (expiresIn: string): number | null => {
  // Supports values like: "900", "15m", "7d", "1h".
  const raw = expiresIn.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult =
    unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
};

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const otpKey = (type: "email" | "reset", email: string) =>
  `otp:${type}:${normalizeEmail(email)}`;

type PendingSignup = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

type StoredOtp = {
  otpHash: string;
  createdAt: string;
  // For register flow
  signup?: PendingSignup;
};

const computeOtpHash = (email: string, otp: string) => {
  const pepper = getJwtSecret();
  return sha256(`${normalizeEmail(email)}:${otp}:${pepper}`);
};

const storeOtp = async (
  key: string,
  payload: StoredOtp,
  ttlSeconds: number
) => {
  await redis.set(key, JSON.stringify(payload), "EX", ttlSeconds);
};

const readOtp = async (key: string): Promise<StoredOtp | null> => {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredOtp;
  } catch {
    return null;
  }
};

const clearOtp = async (key: string) => {
  await redis.del(key);
};

export const issueTokensAndSession = async (
  user: { id: string; email: string; role: UserRole },
  meta: {
    deviceId: string;
    deviceType?: string;
    userAgent?: string;
    ipAddress?: string;
  }
): Promise<AuthTokens> => {
  const accessExpiresIn = resolveExpiresIn(config.jwt.expires_in, "15m");
  const refreshExpiresIn = resolveExpiresIn(
    config.jwt.refresh_token_expires_in,
    "30d"
  );

  const refreshSeconds = parseExpiresInSeconds(refreshExpiresIn);
  if (!refreshSeconds) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Server misconfigured: REFRESH_TOKEN_EXPIRES_IN must be like '30d' or seconds"
    );
  }

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshToken: "__PENDING__",
      deviceId: meta.deviceId,
      deviceType: meta.deviceType,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: addSeconds(new Date(), refreshSeconds),
    },
  });

  const accessToken = jwtHelpers.createToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    accessExpiresIn
  );

  const refreshToken = jwtHelpers.createToken(
    {
      sessionId: session.id,
      userId: user.id,
    },
    getRefreshSecret(),
    refreshExpiresIn
  );

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshToken: sha256(`${session.id}:${refreshToken}`),
    },
  });

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
};

export const registerService = async (payload: RegisterInput) => {
  const email = normalizeEmail(payload.email);

  const existing = await prisma.userAuth.findUnique({ where: { email } });
  if (existing) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "User with this email already exists"
    );
  }

  const otp = generateOTP();
  const otpHash = computeOtpHash(email, otp);
  const passwordHash = await hashPassword(payload.password);
  const ttlSeconds = OTP_EXPIRE_DURATION_MINUTES * 60;

  await storeOtp(
    otpKey("email", email),
    {
      otpHash,
      createdAt: new Date().toISOString(),
      signup: {
        email,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
    },
    ttlSeconds
  );

  await otpQueue.add(
    "send-email-verification-otp",
    {
      otpCode: otp,
      identifier: email,
      type: "email",
    },
    {
      removeOnComplete: 25,
      removeOnFail: 25,
    }
  );

  return {
    email,
    otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES,
  };
};

// Dedicated entry-point for "register without OTP".
// Creates the user immediately (no Redis OTP, no email verification step).
export const registerWithoutOtpService = async (payload: RegisterInput) => {
  const email = normalizeEmail(payload.email);

  const passwordHash = await hashPassword(payload.password);

  let created: { id: string; email: string };
  try {
    created = await prisma.userAuth.create({
      data: {
        email,
        password: passwordHash,
        role: UserRole.USER,
        provider: "EMAIL_PASSWORD",
        userDetails: {
          create: {
            firstName: payload.firstName,
            lastName: payload.lastName,
          },
        },
      },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "User with this email already exists"
      );
    }
    throw error;
  }

  return {
    id: created.id,
    email: created.email,
  };
};

export const verifyEmailOtpService = async (payload: VerifyEmailOtpInput) => {
  const email = normalizeEmail(payload.email);
  const key = otpKey("email", email);
  const stored = await readOtp(key);

  if (!stored?.signup) {
    throw new ApiError(httpStatus.BAD_REQUEST, "OTP expired or not found");
  }

  const incomingHash = computeOtpHash(email, payload.otp);
  if (incomingHash !== stored.otpHash) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }

  let created: { id: string; email: string };
  try {
    created = await prisma.userAuth.create({
      data: {
        email,
        password: stored.signup.passwordHash,
        role: UserRole.USER,
        provider: "EMAIL_PASSWORD",
        userDetails: {
          create: {
            firstName: stored.signup.firstName,
            lastName: stored.signup.lastName,
          },
        },
      },
      select: { id: true, email: true },
    });
  } catch (error) {
    await clearOtp(key);
    if (isUniqueConstraintError(error)) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "User with this email already exists"
      );
    }
    throw error;
  }

  await clearOtp(key);

  return {
    id: created.id,
    email: created.email,
  };
};

export const loginService = async (payload: LoginInput) => {
  const email = normalizeEmail(payload.email);
  const user = await prisma.userAuth.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      provider: true,
    },
  });
  if (!user || !user.password) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  const ok = await comparePassword(payload.password, user.password);
  if (!ok) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid credentials");
  }

  const deviceId =
    payload.deviceId?.trim() ||
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const tokens = await issueTokensAndSession(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    {
      deviceId,
      deviceType: payload.deviceType,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
    }
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      provider: user.provider,
    },
    ...tokens,
    deviceId,
  };
};

// Dedicated entry-point for "login without OTP".
// Currently identical to email+password login, but kept separate per API contract.
export const loginWithoutOtpService = async (payload: LoginInput) => {
  return loginService(payload);
};

export const forgotPasswordService = async (payload: ForgotPasswordInput) => {
  const email = normalizeEmail(payload.email);
  const user = await prisma.userAuth.findUnique({ where: { email } });
  if (!user) {
    // Avoid user enumeration.
    return {
      email,
      otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES,
    };
  }

  const otp = generateOTP();
  const otpHash = computeOtpHash(email, otp);
  const ttlSeconds = OTP_EXPIRE_DURATION_MINUTES * 60;

  await storeOtp(
    otpKey("reset", email),
    {
      otpHash,
      createdAt: new Date().toISOString(),
    },
    ttlSeconds
  );

  await otpQueue.add(
    "send-password-reset-otp",
    {
      otpCode: otp,
      identifier: email,
      type: "email",
    },
    {
      removeOnComplete: 25,
      removeOnFail: 25,
    }
  );

  return {
    email,
    otpExpiresInMinutes: OTP_EXPIRE_DURATION_MINUTES,
  };
};

export const resetPasswordService = async (payload: ResetPasswordInput) => {
  const email = normalizeEmail(payload.email);
  const user = await prisma.userAuth.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  const key = otpKey("reset", email);
  const stored = await readOtp(key);
  if (!stored) {
    throw new ApiError(httpStatus.BAD_REQUEST, "OTP expired or not found");
  }

  const incomingHash = computeOtpHash(email, payload.otp);
  if (incomingHash !== stored.otpHash) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }

  const newHash = await hashPassword(payload.newPassword);

  await prisma.$transaction([
    prisma.userAuth.update({
      where: { id: user.id },
      data: { password: newHash },
    }),
    prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await clearOtp(key);

  return { email };
};

import passport from "passport";
import type { Context } from "hono";
import httpStatus from "http-status";
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
} from "passport-google-oauth20";
import {
  Strategy as FacebookStrategy,
  type Profile as FacebookProfile,
} from "passport-facebook";

import { config } from "../../../config";
import ApiError from "../../../error/ApiErrors";
import prisma from "../../../shared/prisma";
import { UserRole } from "@prisma/client";
import { issueTokensAndSession } from "./auth.service";
import { setAuthCookies } from "./auth.cookies";

type MinimalUser = { id: string; email: string; role: UserRole };

const normalizeEmail = (email: string) => email.trim().toLowerCase();

let configured = false;

const requireEnv = (name: string, value?: string) => {
  if (!value) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Server misconfigured: ${name} is not set`
    );
  }
  return value;
};

const resolveCallbackUrl = (path: string) => {
  const base = config.url.backend_url?.trim().replace(/\/+$/, "");
  if (base) return `${base}${path}`;
  // Fallback: relative callback (works if behind a reverse proxy that preserves host)
  return path;
};

const profileEmail = (profile: {
  emails?: Array<{ value?: string | null }>;
}) => {
  const value = profile.emails?.[0]?.value;
  return value ? normalizeEmail(value) : null;
};

const upsertOAuthUser = async (params: {
  provider: "GOOGLE" | "FACEBOOK";
  providerUserId: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const { provider, providerUserId, email, firstName, lastName } = params;

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider,
        providerUserId,
      },
    },
  });

  if (existingOAuth) {
    const auth = await prisma.userAuth.findUnique({
      where: { id: existingOAuth.userId },
    });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "Linked user not found");
    }
    return {
      id: auth.id,
      email: auth.email,
      role: auth.role,
    } satisfies MinimalUser;
  }

  if (!email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Social provider did not return an email address"
    );
  }

  // If a user exists with the same email, link it; else create.
  let auth = await prisma.userAuth.findUnique({ where: { email } });
  if (!auth) {
    auth = await prisma.userAuth.create({
      data: {
        email,
        password: null,
        role: UserRole.USER,
        provider,
      },
    });

    await prisma.userDetails.create({
      data: {
        userId: auth.id,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      userId: auth.id,
      provider,
      providerUserId,
    },
  });

  return {
    id: auth.id,
    email: auth.email,
    role: auth.role,
  } satisfies MinimalUser;
};

export const ensurePassportConfigured = () => {
  if (configured) return;

  const googleClientId = config.google?.client_id;
  const googleClientSecret = config.google?.client_secret;
  const facebookAppId = config.facebook?.app_id;
  const facebookAppSecret = config.facebook?.app_secret;

  // We only register strategies if the env vars exist.
  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: resolveCallbackUrl(
            "/api/v1/auth/social-login/google/callback"
          ),
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done
        ) => {
          try {
            const email = profileEmail(profile);
            const user = await upsertOAuthUser({
              provider: "GOOGLE",
              providerUserId: profile.id,
              email,
              firstName: profile.name?.givenName ?? null,
              lastName: profile.name?.familyName ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err as any);
          }
        }
      )
    );
  }

  if (facebookAppId && facebookAppSecret) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: facebookAppId,
          clientSecret: facebookAppSecret,
          callbackURL: resolveCallbackUrl(
            "/api/v1/auth/social-login/facebook/callback"
          ),
          profileFields: ["id", "emails", "name"],
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: FacebookProfile,
          done
        ) => {
          try {
            const email = profileEmail(profile);
            const user = await upsertOAuthUser({
              provider: "FACEBOOK",
              providerUserId: profile.id,
              email,
              firstName: (profile as any).name?.givenName ?? null,
              lastName: (profile as any).name?.familyName ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err as any);
          }
        }
      )
    );
  }

  // No sessions in this API.
  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((obj: any, done) => done(null, obj));

  configured = true;
};

const makeReqFromHono = (c: Context) => {
  const url = new URL(c.req.url);
  const headers: Record<string, string> = {};
  for (const [k, v] of c.req.raw.headers.entries()) headers[k] = v;

  return {
    method: c.req.method,
    url: url.pathname + url.search,
    headers,
    query: Object.fromEntries(url.searchParams.entries()),
    body: undefined,
  } as any;
};

const runPassport = (
  c: Context,
  strategy: string,
  options: any,
  onSuccess: (user: MinimalUser) => Promise<Response>
) => {
  ensurePassportConfigured();

  return new Promise<Response>((resolve, reject) => {
    const req = makeReqFromHono(c);

    const res = {
      statusCode: 302,
      headers: new Map<string, string>(),
      setHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), String(value));
      },
      getHeader(name: string) {
        return this.headers.get(name.toLowerCase());
      },
      writeHead(statusCode: number, headers?: Record<string, string>) {
        this.statusCode = statusCode;
        if (headers) {
          for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
        }
      },
      end(_body?: any) {
        const location = this.getHeader("location");
        if (location) {
          resolve(c.redirect(location, this.statusCode as any));
          return;
        }
        resolve(
          c.json({ success: false, message: "Passport ended response" }, 500)
        );
      },
      redirect(location: string) {
        this.setHeader("location", location);
        this.statusCode = 302;
        this.end();
      },
    } as any;

    const middleware = passport.authenticate(
      strategy,
      options,
      async (err: any, user: any) => {
        if (err) return reject(err);
        if (!user) {
          return resolve(
            c.json({ success: false, message: "Social login failed" }, 401)
          );
        }
        try {
          resolve(await onSuccess(user as MinimalUser));
        } catch (e) {
          reject(e);
        }
      }
    );

    try {
      middleware(req, res, (err2: any) => {
        if (err2) reject(err2);
      });
    } catch (e) {
      reject(e);
    }
  });
};

export const googleAuthRedirect = async (c: Context) => {
  requireEnv("GOOGLE_CLIENT_ID", config.google?.client_id);
  requireEnv("GOOGLE_CLIENT_SECRET", config.google?.client_secret);

  return runPassport(
    c,
    "google",
    {
      session: false,
      scope: ["profile", "email"],
    },
    async () => c.json({ success: false, message: "Unexpected" }, 500)
  );
};

export const googleAuthCallback = async (c: Context) => {
  return runPassport(c, "google", { session: false }, async (user) => {
    const deviceId = c.req.header("x-device-id") ?? undefined;
    const userAgent = c.req.header("user-agent") ?? undefined;
    const ipAddress = c.req.header("x-forwarded-for") ?? undefined;

    const tokens = await issueTokensAndSession(
      { id: user.id, email: user.email, role: user.role },
      {
        deviceId:
          deviceId?.trim() ||
          globalThis.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userAgent,
        ipAddress,
      }
    );

    setAuthCookies(c, tokens);

    return c.json(
      {
        success: true,
        message: "Social login successful",
        data: {
          user,
          ...tokens,
        },
      },
      200
    );
  });
};

export const facebookAuthRedirect = async (c: Context) => {
  requireEnv("FACEBOOK_APP_ID", config.facebook?.app_id);
  requireEnv("FACEBOOK_APP_SECRET", config.facebook?.app_secret);

  return runPassport(
    c,
    "facebook",
    {
      session: false,
      scope: ["email"],
    },
    async () => c.json({ success: false, message: "Unexpected" }, 500)
  );
};

export const facebookAuthCallback = async (c: Context) => {
  return runPassport(c, "facebook", { session: false }, async (user) => {
    const deviceId = c.req.header("x-device-id") ?? undefined;
    const userAgent = c.req.header("user-agent") ?? undefined;
    const ipAddress = c.req.header("x-forwarded-for") ?? undefined;

    const tokens = await issueTokensAndSession(
      { id: user.id, email: user.email, role: user.role },
      {
        deviceId:
          deviceId?.trim() ||
          globalThis.crypto?.randomUUID?.() ||
          `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userAgent,
        ipAddress,
      }
    );

    setAuthCookies(c, tokens);

    return c.json(
      {
        success: true,
        message: "Social login successful",
        data: {
          user,
          ...tokens,
        },
      },
      200
    );
  });
};

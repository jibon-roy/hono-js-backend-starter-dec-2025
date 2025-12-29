import httpStatus from "http-status";
import { UserRole } from "@prisma/client";

import ApiError from "../../../error/ApiErrors";
import prisma from "../../../shared/prisma";
import { hashPassword } from "../../../utils/passwordHelpers";

type UserDetailsInput = {
  address?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
};

type CreateUserInput = {
  email: string;
  password: string;
  role?: UserRole;
} & UserDetailsInput;

type UpdateUserInput = {
  role?: UserRole;
} & UserDetailsInput;

const sanitizeAuth = (auth: any) => {
  if (!auth) return auth;
  // Prisma returns `password` by default; never expose it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = auth;
  return rest;
};

const rethrowOrWrap = (error: unknown, fallbackMessage: string) => {
  if (error instanceof ApiError) throw error;
  if (error instanceof Error)
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, fallbackMessage);
};

// get all user service
const getAllUsersService = async () => {
  try {
    const users = await prisma.userAuth.findMany();
    const ids = users.map((u) => u.id);
    const details = await prisma.userDetails.findMany({
      where: { userId: { in: ids } },
    });
    const detailsByUserId = new Map(details.map((d) => [d.userId, d] as const));

    return users.map((u) => ({
      ...sanitizeAuth(u),
      details: detailsByUserId.get(u.id) ?? null,
    }));
  } catch (error) {
    rethrowOrWrap(error, "Failed to retrieve users");
  }
};

const createUserService = async (payload: CreateUserInput) => {
  try {
    const existingUser = await prisma.userAuth.findUnique({
      where: { email: payload.email },
    });

    if (existingUser) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "User with this email already exists"
      );
    }

    const hashed = await hashPassword(payload.password);

    const auth = await prisma.userAuth.create({
      data: {
        email: payload.email,
        password: hashed,
        role: payload.role ?? UserRole.USER,
      },
    });

    const details = await prisma.userDetails.create({
      data: {
        userId: auth.id,
        address: payload.address,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
    });

    return {
      ...sanitizeAuth(auth),
      details,
    };
  } catch (error) {
    rethrowOrWrap(error, "Failed to create user");
  }
};

const getUserByIdService = async (id: string) => {
  try {
    const auth = await prisma.userAuth.findUnique({ where: { id } });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }
    const details = await prisma.userDetails.findUnique({
      where: { userId: id },
    });
    return { ...sanitizeAuth(auth), details: details ?? null };
  } catch (error) {
    rethrowOrWrap(error, "Failed to retrieve user");
  }
};

const updateUserByIdService = async (id: string, payload: UpdateUserInput) => {
  try {
    const auth = await prisma.userAuth.findUnique({ where: { id } });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const updatedAuth = await prisma.userAuth.update({
      where: { id },
      data: {
        role: payload.role,
      },
    });

    const updatedDetails = await prisma.userDetails.upsert({
      where: { userId: id },
      create: {
        userId: id,
        address: payload.address,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
      update: {
        address: payload.address,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
    });

    return { ...sanitizeAuth(updatedAuth), details: updatedDetails };
  } catch (error) {
    rethrowOrWrap(error, "Failed to update user");
  }
};

const deleteUserByIdService = async (id: string) => {
  try {
    const auth = await prisma.userAuth.findUnique({ where: { id } });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const details = await prisma.userDetails.findUnique({
      where: { userId: id },
    });
    await prisma.userDetails.deleteMany({ where: { userId: id } });
    const deletedAuth = await prisma.userAuth.delete({ where: { id } });

    return { ...sanitizeAuth(deletedAuth), details: details ?? null };
  } catch (error) {
    rethrowOrWrap(error, "Failed to delete user");
  }
};

const updateUserPasswordService = async (id: string, password: string) => {
  try {
    const auth = await prisma.userAuth.findUnique({ where: { id } });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }
    const hashed = await hashPassword(password);
    const updated = await prisma.userAuth.update({
      where: { id },
      data: { password: hashed },
    });
    return sanitizeAuth(updated);
  } catch (error) {
    rethrowOrWrap(error, "Failed to update password");
  }
};

const updateUserEmailService = async (id: string, email: string) => {
  try {
    const auth = await prisma.userAuth.findUnique({ where: { id } });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const existing = await prisma.userAuth.findUnique({ where: { email } });
    if (existing && existing.id !== id) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "User with this email already exists"
      );
    }

    const updated = await prisma.userAuth.update({
      where: { id },
      data: { email },
    });

    return sanitizeAuth(updated);
  } catch (error) {
    rethrowOrWrap(error, "Failed to update email");
  }
};

export {
  getAllUsersService,
  createUserService,
  getUserByIdService,
  updateUserByIdService,
  deleteUserByIdService,
  updateUserPasswordService,
  updateUserEmailService,
};

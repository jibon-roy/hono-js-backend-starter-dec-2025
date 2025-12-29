import { z } from "zod";
import { UserRole } from "@prisma/client";

const objectIdSchema = z
  .string()
  .min(1, "id is required")
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid id format");

const commonQuerySchema = z.record(z.string(), z.string());

const userDetailsSchema = z
  .object({
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  })
  .strict();

const createUserSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
      password: z.string().min(6, "Password must be at least 6 characters"),
      role: z.nativeEnum(UserRole).optional(),
      ...userDetailsSchema.shape,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.record(z.string(), z.string()),
});

const getUserByIdSchema = z.object({
  body: z.any().optional(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserSchema = z.object({
  body: z
    .object({
      role: z.nativeEnum(UserRole).optional(),
      ...userDetailsSchema.partial().shape,
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const deleteUserSchema = z.object({
  body: z.any().optional(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserPasswordSchema = z.object({
  body: z
    .object({
      password: z.string().min(6, "Password must be at least 6 characters"),
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

const updateUserEmailSchema = z.object({
  body: z
    .object({
      email: z.string().email(),
    })
    .strict(),
  query: commonQuerySchema,
  params: z.object({ id: objectIdSchema }).strict(),
});

export const userValidation = {
  objectIdSchema,
  createUserSchema,
  getUserByIdSchema,
  updateUserSchema,
  deleteUserSchema,
  updateUserPasswordSchema,
  updateUserEmailSchema,
};

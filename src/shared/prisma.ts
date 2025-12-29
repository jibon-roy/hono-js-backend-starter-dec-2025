import "dotenv/config";
import {
  PrismaClient,
  type PrismaClient as PrismaClientType,
} from "@prisma/client";

/**
 * Prevent multiple Prisma instances in Bun hot reload
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClientType | undefined;
}

const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log:
      process.env?.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
    errorFormat: "pretty",
  });

if (process.env?.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export default prisma;

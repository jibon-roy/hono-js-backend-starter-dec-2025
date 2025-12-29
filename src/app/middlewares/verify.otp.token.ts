import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import type { MiddlewareHandler } from "hono";

import ApiError from "../../error/ApiErrors";
import prisma from "../../shared/prisma";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import { config } from "../../config";

const validateOtpMiddleware = (...roles: string[]): MiddlewareHandler => {
  return async (c, next) => {
    try {
      const token = c.req.header("authorization");
      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!");
      }
      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as Secret
      );

      // For EMAIL_VERIFICATION (signup), user won't exist in DB yet
      if (verifiedUser.otpType === "EMAIL_VERIFICATION") {
        c.set("user", verifiedUser);
        await next();
        return;
      }

      // For other OTP types (PASSWORD_RESET, etc.), check if user exists
      const existingUser = await prisma.userAuth.findUnique({
        where: { id: verifiedUser.id },
      });

      if (!existingUser) {
        throw new ApiError(404, "User Not Found");
      }

      c.set("user", verifiedUser);

      if (roles.length && !roles.includes(verifiedUser.role)) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Forbidden! You are not authorized"
        );
      }
      await next();
    } catch (err) {
      throw err;
    }
  };
};

export default validateOtpMiddleware;

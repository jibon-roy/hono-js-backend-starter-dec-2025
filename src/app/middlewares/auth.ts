import type { MiddlewareHandler } from "hono";
import type { Secret } from "jsonwebtoken";
import httpStatus from "http-status";

import ApiError from "../../error/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import prisma from "../../shared/prisma";
import { config } from "../../config";

//  auth(UserRole.SUPER_ADMIN, UserRole.ADMIN)

const auth = (...roles: string[]): MiddlewareHandler => {
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

      const user = await prisma.userAuth.findUnique({
        where: {
          email: verifiedUser.email,
        },
      });

      if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, "This user is not found !");
      }

      if (roles.length && !roles.includes(verifiedUser.role)) {
        throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
      }

      c.set("user", verifiedUser);

      await next();
    } catch (err) {
      throw err;
    }
  };
};

export default auth;

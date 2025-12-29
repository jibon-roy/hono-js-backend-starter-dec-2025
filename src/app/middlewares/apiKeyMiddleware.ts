import httpStatus from "http-status";
import type { MiddlewareHandler } from "hono";

import ApiError from "../../error/ApiErrors";
import { config } from "../../config";

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const apiKey = c.req.header("x-api-key");

    if (!apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "API key is required");
    }

    const isValidKey = apiKey === config.jwt.api_key;
    if (!isValidKey) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Invalid or inactive API key"
      );
    }

    await next();
  } catch (error) {
    throw error;
  }
};

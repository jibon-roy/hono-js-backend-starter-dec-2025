import type { Handler } from "hono";

const catchAsync = (fn: Handler): Handler => {
  return async (c, next) => {
    try {
      return await fn(c, next);
    } catch (err) {
      throw err;
    }
  };
};

export default catchAsync;

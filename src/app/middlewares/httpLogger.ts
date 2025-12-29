import type { MiddlewareHandler } from "hono";

import logger from "../../utils/logger";

export const httpLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.http(`${c.req.method} ${c.req.path} ${c.res.status} - ${duration}ms`);
};

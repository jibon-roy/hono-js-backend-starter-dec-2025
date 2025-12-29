import type { ZodTypeAny } from "zod";

import type { MiddlewareHandler } from "hono";

const validateRequest = (schema: ZodTypeAny) =>
  (async (c, next) => {
    let body: unknown = undefined;

    try {
      const contentType = c.req.header("content-type") ?? "";
      // NOTE: Read from a cloned Request to avoid consuming the original body.
      // This keeps handlers/controllers free to call `c.req.json()` later.
      const cloned = c.req.raw.clone();

      if (contentType.includes("application/json")) {
        body = await cloned.json();
      } else if (
        contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded")
      ) {
        const formData = await cloned.formData();
        body = Object.fromEntries(formData.entries());
      } else if (contentType.includes("text/")) {
        body = await cloned.text();
      } else {
        // fallback: attempt to parse as JSON, else leave undefined
        try {
          body = await cloned.json();
        } catch {
          body = undefined;
        }
      }
    } catch {
      body = undefined;
    }

    // safely parse stringified body if possible
    let parsedBody: any = body;
    if (parsedBody && typeof parsedBody.data === "string") {
      try {
        parsedBody = JSON.parse(parsedBody.data);
      } catch {
        // keep as-is (e.g., FormData)
      }
    }

    await schema.parseAsync({
      body: parsedBody,
      query: c.req.query(),
      params: c.req.param(),
    });

    await next();
  }) satisfies MiddlewareHandler;

export default validateRequest;

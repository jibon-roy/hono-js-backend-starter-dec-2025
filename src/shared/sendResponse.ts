import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const sendResponse = <T>(
  c: Context,
  jsonData: {
    statusCode: ContentfulStatusCode;
    success: boolean;
    message: string;
    meta?: {
      page: number;
      limit: number;
      total: number;
    };
    data: T | null | undefined;
  }
) => {
  return c.json(
    {
      success: jsonData.success,
      message: jsonData.message,
      meta: jsonData.meta ?? null,
      data: jsonData.data ?? null,
    },
    jsonData.statusCode as any
  );
};

export default sendResponse;

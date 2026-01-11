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
    data?: T | null | undefined;
  }
) => {
  if (jsonData.data === undefined) {
    delete jsonData.data;
  }
  if (jsonData.meta === undefined) {
    delete jsonData.meta;
  }
  return c.json(jsonData, jsonData.statusCode as any);
};

export default sendResponse;

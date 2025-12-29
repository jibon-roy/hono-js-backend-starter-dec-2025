import type { JwtVariables } from "hono/jwt";
import type { RequestIdVariables } from "hono/request-id";

declare module "hono" {
  interface ContextVariableMap {
    user: JwtVariables["jwtPayload"];
    requestId: RequestIdVariables["requestId"];
  }
}

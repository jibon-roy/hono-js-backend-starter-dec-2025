import type { Context } from "hono";
import { setCookie } from "hono/cookie";

import { config } from "../../../config";

const parseExpiresInSeconds = (expiresIn: string): number | null => {
  const raw = expiresIn.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult =
    unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mult;
};

const isSecureCookie = () => config.env === "production";

const sameSite: "Lax" | "Strict" | "None" = "Lax";

export const setAuthCookies = (
  c: Context,
  tokens: {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }
) => {
  const accessTtl =
    parseExpiresInSeconds(String(config.jwt.expires_in ?? "15m")) ?? 900;
  const refreshTtl =
    parseExpiresInSeconds(
      String(config.jwt.refresh_token_expires_in ?? "30d")
    ) ?? 30 * 24 * 60 * 60;

  const secure = isSecureCookie();

  setCookie(c, "accessToken", tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: accessTtl,
  });

  setCookie(c, "refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: refreshTtl,
  });

  // Not strictly secret, but keeping it httpOnly avoids client-side tampering.
  setCookie(c, "sessionId", tokens.sessionId, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: refreshTtl,
  });
};

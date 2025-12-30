// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import router from "./app/routes";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import { config } from "./config";
import prisma from "./shared/prisma";
import {
  initializeQueueSystem,
  setupGracefulShutdown,
} from "./helpers/queue-manager/queueManager";
import status from "http-status";

const app = new Hono();

const normalizeOrigin = (value?: string) => {
  if (!value) return "";
  // Origins never include a trailing slash; env URLs often do.
  return value.trim().replace(/\/+$/, "");
};

// --------------------
// Middlewares
// --------------------

app.use("*", async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const requestId = incoming?.trim()
    ? incoming.trim()
    : globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  c.set("requestId", requestId);
  await next();
  c.header("X-Request-Id", requestId);
});

app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
  })
);

// Scope heavier middleware to the API namespace.
// This keeps lightweight endpoints (like / and /status) fast and stable under load.
app.use(
  "/api/v1/*",
  bodyLimit({
    maxSize: config.http.max_body_size,
    onError: (c) =>
      c.json({ success: false, message: "Payload too large" }, 413),
  })
);
app.use(
  "/api/v1",
  bodyLimit({
    maxSize: config.http.max_body_size,
    onError: (c) =>
      c.json({ success: false, message: "Payload too large" }, 413),
  })
);
app.use("/api/v1/*", timeout(config.http.request_timeout_ms));
app.use("/api/v1", timeout(config.http.request_timeout_ms));
app.use("/api/v1/*", compress());
app.use("/api/v1", compress());
if (config.env !== "production") {
  app.use("/api/v1/*", logger());
  app.use("/api/v1", logger());
}

app.use(
  "/api/v1/*",
  cors({
    origin: (origin) => {
      // Non-browser clients may not send Origin.
      if (!origin) return "*";

      // Prefer a strict allow-list in production.
      const allowed = normalizeOrigin(config.frontend_url);
      if (allowed && normalizeOrigin(origin) === allowed) return origin;
      if (config.env !== "production") return origin;
      return "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Access-Token",
      "X-API-Key",
      "X-Device-Id",
      "X-Request-Id",
    ],
    // If origin is wildcard, credentials must be disabled.
    credentials: Boolean(config.frontend_url),
  })
);
app.use(
  "/api/v1",
  cors({
    origin: (origin) => {
      // Non-browser clients may not send Origin.
      if (!origin) return "*";

      // Prefer a strict allow-list in production.
      const allowed = normalizeOrigin(config.frontend_url);
      if (allowed && normalizeOrigin(origin) === allowed) return origin;
      if (config.env !== "production") return origin;
      return "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Access-Token",
      "X-API-Key",
      "X-Device-Id",
      "X-Request-Id",
    ],
    // If origin is wildcard, credentials must be disabled.
    credentials: Boolean(config.frontend_url),
  })
);

// Default to JSON content type only when a handler didn't already set one.
app.use("/api/v1/*", async (c, next) => {
  await next();
  if (!c.res.headers.get("Content-Type")) {
    c.header("Content-Type", "application/json");
  }
});
app.use("/api/v1", async (c, next) => {
  await next();
  if (!c.res.headers.get("Content-Type")) {
    c.header("Content-Type", "application/json");
  }
});

initializeQueueSystem();
setupGracefulShutdown();

// Warm up Prisma connection to avoid first-request latency spikes.
prisma.$connect().catch((err) => {
  console.error("❌ Prisma connection error:", (err as any)?.message ?? err);
});
// --------------------
// Routes
// --------------------

// Root route (kept intentionally lightweight for uptime checks / load tests).
app.get("/", (c) => c.text("OK"));

// Root route
app.get("/status", (c) => {
  return c.json({ status: status.OK, message: "API is running ✅" });
});

// Mount the main router under /api/v1
app.route("/api/v1", router);

app.onError((err, c) => GlobalErrorHandler(err, c));

export default app;

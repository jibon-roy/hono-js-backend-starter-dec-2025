// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timeout } from "hono/timeout";
import router from "./app/routes";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import { config } from "./config";
import {
  initializeQueueSystem,
  setupGracefulShutdown,
} from "./helpers/queue-manager/queueManager";

const app = new Hono();

// --------------------
// Middlewares
// --------------------

app.use("*", requestId());

app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "no-referrer",
  })
);

app.use(
  "*",
  bodyLimit({
    maxSize: config.http.max_body_size,
    onError: (c) =>
      c.json({ success: false, message: "Payload too large" }, 413),
  })
);

app.use("*", timeout(config.http.request_timeout_ms));

// Compress responses (particularly helpful for JSON).
app.use("*", compress());

// Logger middleware for requests
app.use("*", logger());

// CORS middleware (allow all origins, you can customize)
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Non-browser clients may not send Origin.
      if (!origin) return "*";

      // Prefer a strict allow-list in production.
      if (config.frontend_url && origin === config.frontend_url) return origin;
      if (config.env !== "production") return origin;
      return "";
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Access-Token",
      "X-API-Key",
      "X-Request-Id",
    ],
    // If origin is wildcard, credentials must be disabled.
    credentials: Boolean(config.frontend_url),
  })
);

// Default to JSON content type only when a handler didn't already set one.
app.use("*", async (c, next) => {
  await next();
  if (!c.res.headers.get("Content-Type")) {
    c.header("Content-Type", "application/json");
  }
});

initializeQueueSystem();
setupGracefulShutdown();
// --------------------
// Routes
// --------------------
app.route("/", router);

app.onError((err, c) => GlobalErrorHandler(err, c));

export default app;

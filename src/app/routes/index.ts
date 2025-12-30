import { Hono } from "hono";

import {
  bullBoard,
  bullBoardBasePath,
} from "../../helpers/queueMonitor/bullBoard";

import { apiKeyMiddleware } from "../middlewares/apiKeyMiddleware";
import { apiAccessTokenMiddleware } from "../middlewares/apiAccessTokenMiddleware";

import userRouter from "../modules/user/user.route";
import authRouter from "../modules/auth/auth.route";

const router = new Hono();

// Public API health check.
router.get("/", (c) => c.json({ status: "ok" }));

// Protect all API routes except the root health check.
router.use("/users", apiKeyMiddleware);
router.use("/users", apiAccessTokenMiddleware);
router.use("/users/*", apiKeyMiddleware);
router.use("/users/*", apiAccessTokenMiddleware);

// Mount sub-routers
router.route("/auth", authRouter);
router.route("/users", userRouter);

// Bull Board UI (queues monitor)
router.use(bullBoardBasePath, apiKeyMiddleware);
router.use(`${bullBoardBasePath}/*`, apiKeyMiddleware);
router.use(bullBoardBasePath, apiAccessTokenMiddleware);
router.use(`${bullBoardBasePath}/*`, apiAccessTokenMiddleware);
router.route(bullBoardBasePath, bullBoard);

// Catch-all 404
router.all("*", (c) => c.json({ error: "Route not found" }, 404));

export default router;

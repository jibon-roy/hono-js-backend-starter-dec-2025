import { Hono } from "hono";

import {
  bullBoard,
  bullBoardBasePath,
} from "../../helpers/queueMonitor/bullBoard";

import { apiKeyMiddleware } from "../middlewares/apiKeyMiddleware";

import userRouter from "../modules/user/user.route";

const router = new Hono();

// Root route
router.get("/", (c) => {
  return c.json({ message: "API is running ✅" });
});

// Mount sub-routers
router.route("/users", userRouter);

// Bull Board UI (queues monitor)
router.use(bullBoardBasePath, apiKeyMiddleware);
router.use(`${bullBoardBasePath}/*`, apiKeyMiddleware);
router.route(bullBoardBasePath, bullBoard);

// Catch-all 404
router.all("*", (c) => c.json({ error: "Route not found" }, 404));

export default router;

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "hono/bun";

import { mailQueue, otpQueue } from "../queue";

const serverAdapter = new HonoAdapter(serveStatic);

// All queues you want to monitor
const queues = [new BullMQAdapter(otpQueue), new BullMQAdapter(mailQueue)];

createBullBoard({ queues, serverAdapter });

export const bullBoardBasePath = "/admin/queues";
serverAdapter.setBasePath(bullBoardBasePath);

export const bullBoard = serverAdapter.registerPlugin();

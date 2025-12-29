import { Queue } from "bullmq";
import { otpQueue } from "../queue";

export const cleanQueue = async (queue: Queue) => {
  try {
    // ১ ঘণ্টার পুরানো জব ক্লিনআপ
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    await Promise.all([
      queue.clean(oneHourAgo, 100, "completed"),
      queue.clean(oneHourAgo, 100, "failed"),
      queue.clean(oneHourAgo, 100, "delayed"),
    ]);

    console.log("🧹 OTP queue cleaned successfully");
  } catch (error) {
    console.error("❌ Failed to clean OTP queue:", error);
  }
};

// Cleaner utility: প্রতি ১ ঘন্টা পর সব queue clean করবে
const queues: Queue[] = [otpQueue];

setInterval(() => {
  queues.forEach((q) => cleanQueue(q));
}, 60 * 60 * 1000);

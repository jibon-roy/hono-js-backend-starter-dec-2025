import { Job, WorkerOptions, Worker } from "bullmq";
import { redis } from "../../lib/redisConnection";

export const createWorker = (
  name: string,
  processor: (job: Job) => Promise<any>,
  options?: WorkerOptions
) => {
  const worker = new Worker(name, processor, {
    connection: redis,
    concurrency: 5, // একসাথে ৫টি OTP প্রসেস করতে পারবে
    limiter: {
      max: 10, // প্রতি সেকেন্ডে সর্বোচ্চ ১০টি OTP
      duration: 1000,
    },
    ...options,
  });

  // Worker ইভেন্ট হ্যান্ডেলিং
  worker.on("completed", (job) => {
    console.log(`✅ ${name} job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ ${name} job ${job?.id} failed:`, err);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`⚠️ ${name} job ${jobId} stalled`);
  });

  return worker;
};

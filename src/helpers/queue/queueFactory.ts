import { Queue, QueueOptions } from "bullmq";
import { redis } from "../../lib/redisConnection";

export const createQueue = (name: string, options?: QueueOptions) => {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3, // ৩ বার চেষ্টা করবে
      backoff: { type: "exponential", delay: 1000 }, // ১সে, ২সে, ৪সে - এভাবে রিট্রাই
      removeOnComplete: 50, // শেষ হওয়া ৫০টি জব রাখবে
      removeOnFail: 25, // ফেইল হওয়া ২৫টি জব রাখবে
    },
    ...options,
  });
};

import {
  ServiceBusClient,
  type ServiceBusReceiver,
  type ServiceBusSender,
} from "@azure/service-bus";
import { config } from "../../config/index.js";
import type { QueueService, VideoJob } from "../../types/index.js";

export class ServiceBusQueueService implements QueueService {
  private client: ServiceBusClient;
  private sender: ServiceBusSender;
  private receiver: ServiceBusReceiver | null = null;
  private queueName: string;

  constructor() {
    this.queueName = config.queue.queueName ?? "video-processing";
    this.client = new ServiceBusClient(config.queue.connectionString);
    this.sender = this.client.createSender(this.queueName);
  }

  async enqueue(job: VideoJob): Promise<void> {
    await this.sender.sendMessages({
      body: job,
      messageId: job.id,
      contentType: "application/json",
      subject: "video-processing",
    });

    console.log(`[Queue] Enqueued job ${job.id}`);
  }

  async processMessages(
    handler: (job: VideoJob) => Promise<void>,
  ): Promise<void> {
    this.receiver = this.client.createReceiver(this.queueName);

    const subscription = this.receiver.subscribe({
      processMessage: async (message) => {
        const job = message.body as VideoJob;
        console.log(`[Queue] Processing job ${job.id}`);

        try {
          await handler(job);
          await this.receiver!.completeMessage(message);
          console.log(`[Queue] Completed job ${job.id}`);
        } catch (error) {
          console.error(`[Queue] Failed job ${job.id}:`, error);
          await this.receiver!.abandonMessage(message);
        }
      },
      processError: async (args) => {
        console.error("[Queue] Error:", args.error);
      },
    });

    // Keep the subscription alive
    console.log(`[Queue] Listening for messages on '${this.queueName}'`);

    // Return a promise that resolves when close() is called
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.receiver) {
          clearInterval(checkInterval);
          subscription.close();
          resolve();
        }
      }, 1000);
    });
  }

  async close(): Promise<void> {
    if (this.receiver) {
      await this.receiver.close();
      this.receiver = null;
    }
    await this.sender.close();
    await this.client.close();
    console.log("[Queue] Closed");
  }
}

let instance: QueueService | null = null;

export function getQueueService(): QueueService {
  if (!instance) {
    instance = new ServiceBusQueueService();
  }
  return instance;
}

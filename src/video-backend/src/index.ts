import cors from "cors";
import express from "express";
import { healthRouter } from "./api/health.js";
import { projectsRouter } from "./api/projects.js";
import { videosRouter } from "./api/videos.js";
import { config } from "./config/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { getLLMProvider } from "./services/llm/index.js";
import { VideoProcessor } from "./services/pipeline/video-processor.js";
import { getPortalClient } from "./services/portal/index.js";
import { getQueueService } from "./services/queue/service-bus-queue.js";
import { getStorageProvider } from "./services/storage/s3-storage.js";
import { getTranscriptionProvider } from "./services/transcription/index.js";
import type { MCPServerConfig } from "./types/index.js";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health", healthRouter);
app.use("/api/videos", videosRouter);
app.use("/api/projects", projectsRouter);

// Error handler
app.use(errorHandler);

async function startWorker(): Promise<void> {
  const llm = getLLMProvider();
  const transcription = getTranscriptionProvider();
  const storage = getStorageProvider();
  const portal = getPortalClient();

  // Load default MCP servers from environment
  const defaultMcpServers = loadMcpServersFromEnv();

  const processor = new VideoProcessor(
    llm,
    transcription,
    storage,
    portal,
    defaultMcpServers,
  );

  const queue = getQueueService();

  console.log("[Worker] Starting message processing...");
  await queue.processMessages(async (job) => {
    await processor.process(job);
  });
}

function loadMcpServersFromEnv(): MCPServerConfig[] {
  const serversJson = process.env.MCP_SERVERS;
  if (!serversJson) return [];

  try {
    const servers = JSON.parse(serversJson) as MCPServerConfig[];
    console.log(
      `[Config] Loaded ${servers.length} MCP servers from environment`,
    );
    return servers;
  } catch (e) {
    console.warn("[Config] Failed to parse MCP_SERVERS env var:", e);
    return [];
  }
}

async function main(): Promise<void> {
  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`[Server] YakShaver Video Backend running on port ${config.port}`);
    console.log(`[Server] LLM Provider: ${config.llm.provider}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
  });

  // Start queue worker
  try {
    await startWorker();
  } catch (error) {
    console.error("[Worker] Failed to start:", error);
    // Server still runs - worker can be restarted independently
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, shutting down...");
  try {
    const queue = getQueueService();
    await queue.close();
  } catch (e) {
    console.error("[Server] Error during shutdown:", e);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Server] SIGINT received, shutting down...");
  try {
    const queue = getQueueService();
    await queue.close();
  } catch (e) {
    console.error("[Server] Error during shutdown:", e);
  }
  process.exit(0);
});

main().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});

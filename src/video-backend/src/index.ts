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
  const storage = getStorageProvider();
  const portal = getPortalClient();
  const defaultMcpServers = loadMcpServersFromEnv();

  const processor = new VideoProcessor({
    llmProvider: llm,
    storageProvider: storage,
    portalClient: portal,
    defaultMcpServers,
    thinkingBudget: Number(process.env.THINKING_BUDGET ?? "10000"),
    maxTurns: Number(process.env.MAX_AGENT_TURNS ?? "50"),
  });

  const queue = getQueueService();

  console.log("[Worker] Starting agentic message processing...");
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
  app.listen(config.port, () => {
    console.log(
      `[Server] YakShaver Video Backend running on port ${config.port}`,
    );
    console.log(`[Server] LLM Provider: ${config.llm.provider}`);
    console.log(`[Server] Mode: Fully agentic (Claude Code-style)`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
  });

  try {
    await startWorker();
  } catch (error) {
    console.error("[Worker] Failed to start:", error);
  }
}

// Graceful shutdown
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    console.log(`[Server] ${signal} received, shutting down...`);
    try {
      const queue = getQueueService();
      await queue.close();
    } catch (e) {
      console.error("[Server] Error during shutdown:", e);
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[Fatal]", err);
  process.exit(1);
});

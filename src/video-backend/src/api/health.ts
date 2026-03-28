import { Router } from "express";
import { config } from "../config/index.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    config: {
      llmProvider: config.llm.provider,
      transcriptionProvider: config.transcription.provider,
      portalConfigured: !!config.portal.baseUrl,
      storageConfigured: !!config.storage.bucket,
    },
  });
});

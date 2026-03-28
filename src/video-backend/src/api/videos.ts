import { Router } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { config } from "../config/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { jobStore } from "../services/pipeline/job-store.js";
import { getQueueService } from "../services/queue/service-bus-queue.js";
import { getStorageProvider } from "../services/storage/s3-storage.js";
import type { VideoJob } from "../types/index.js";

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      (config.upload.allowedMimeTypes as readonly string[]).includes(
        file.mimetype,
      )
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export const videosRouter = Router();

// All video routes require authentication
videosRouter.use(authMiddleware);

/**
 * POST /api/videos/upload
 * Upload a video file for processing.
 * Auth: Required (user identity flows to agent for attribution)
 */
videosRouter.post("/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No video file provided" });
      return;
    }

    const user = req.user!;
    const jobId = uuid();
    const ext = path.extname(req.file.originalname) || ".mp4";
    const videoKey = `uploads/${jobId}${ext}`;
    const projectId = req.body?.projectId as string | undefined;

    // Upload to S3
    const storage = getStorageProvider();
    await storage.upload(videoKey, req.file.path, req.file.mimetype);

    // Create job with user identity
    const job: VideoJob = {
      id: jobId,
      status: "queued",
      submittedBy: user,
      projectId,
      videoKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jobStore.set(job);

    // Enqueue for processing
    const queue = getQueueService();
    await queue.enqueue(job);

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      submittedBy: user.displayName,
      message: "Video uploaded and queued for processing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Upload error:", message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/videos/upload-url
 * Get a presigned URL for direct-to-S3 upload (for large files).
 */
videosRouter.post("/upload-url", async (req, res) => {
  try {
    const user = req.user!;
    const { fileName, contentType, projectId } = req.body;

    if (!fileName || !contentType) {
      res
        .status(400)
        .json({ error: "fileName and contentType are required" });
      return;
    }

    if (
      !(config.upload.allowedMimeTypes as readonly string[]).includes(
        contentType,
      )
    ) {
      res.status(400).json({ error: `Unsupported file type: ${contentType}` });
      return;
    }

    const jobId = uuid();
    const ext = path.extname(fileName) || ".mp4";
    const videoKey = `uploads/${jobId}${ext}`;

    const storage = getStorageProvider();
    const uploadUrl = await storage.getPresignedUploadUrl(
      videoKey,
      contentType,
    );

    const job: VideoJob = {
      id: jobId,
      status: "uploading",
      submittedBy: user,
      projectId,
      videoKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jobStore.set(job);

    res.json({ jobId, uploadUrl, videoKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Upload URL error:", message);
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/videos/:jobId/process
 * Confirm upload is complete and start processing.
 */
videosRouter.post("/:jobId/process", async (req, res) => {
  try {
    const job = jobStore.get(req.params.jobId);

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "uploading") {
      res.status(400).json({
        error: `Job is in '${job.status}' state, expected 'uploading'`,
      });
      return;
    }

    jobStore.update(job.id, { status: "queued" });

    const queue = getQueueService();
    await queue.enqueue({ ...job, status: "queued" });

    res.status(202).json({
      jobId: job.id,
      status: "queued",
      message: "Video processing started",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/videos/jobs/:jobId
 */
videosRouter.get("/jobs/:jobId", (req, res) => {
  const job = jobStore.get(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    id: job.id,
    status: job.status,
    submittedBy: job.submittedBy.displayName,
    projectId: job.projectId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    progress: job.progress,
    result: job.result,
    error: job.error,
  });
});

/**
 * GET /api/videos/jobs
 */
videosRouter.get("/jobs", (_req, res) => {
  const jobs = jobStore.list().map((j) => ({
    id: j.id,
    status: j.status,
    submittedBy: j.submittedBy.displayName,
    projectId: j.projectId,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    error: j.error,
  }));

  res.json(jobs);
});

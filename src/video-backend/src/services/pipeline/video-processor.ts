import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { v4 as uuid } from "uuid";
import type {
  LLMProvider,
  MCPServerConfig,
  PortalClient,
  PortalProject,
  StorageProvider,
  TranscriptionProvider,
  VideoJob,
} from "../../types/index.js";
import { getFFmpegService } from "../ffmpeg/index.js";
import { MCPOrchestrator } from "../mcp/mcp-orchestrator.js";
import {
  INITIAL_SUMMARY_PROMPT,
  PROJECT_SELECTION_PROMPT,
  buildTaskExecutionPrompt,
} from "../mcp/prompts.js";
import { jobStore } from "./job-store.js";

export class VideoProcessor {
  constructor(
    private llmProvider: LLMProvider,
    private transcriptionProvider: TranscriptionProvider,
    private storageProvider: StorageProvider,
    private portalClient: PortalClient,
    private mcpServers: MCPServerConfig[],
  ) {}

  async process(job: VideoJob): Promise<void> {
    const tmpDir = os.tmpdir();
    const videoPath = path.join(tmpDir, `${job.id}-video`);
    const audioPath = path.join(tmpDir, `${job.id}-audio.mp3`);

    try {
      // Step 1: Download video from S3
      this.updateJob(job.id, {
        status: "converting_audio",
        progress: { stage: "converting_audio", message: "Downloading video..." },
      });
      await this.storageProvider.download(job.videoKey, videoPath);

      // Step 2: Convert to audio
      this.updateJob(job.id, {
        progress: {
          stage: "converting_audio",
          message: "Converting video to audio...",
        },
      });
      const ffmpeg = getFFmpegService();
      await ffmpeg.convertVideoToMp3(videoPath, audioPath);

      // Step 3: Transcribe
      this.updateJob(job.id, {
        status: "transcribing",
        progress: { stage: "transcribing", message: "Transcribing audio..." },
      });
      const transcript =
        await this.transcriptionProvider.transcribe(audioPath);

      // Step 4: Analyze transcript
      this.updateJob(job.id, {
        status: "analyzing",
        progress: {
          stage: "analyzing",
          message: "Analyzing transcript...",
          transcript,
        },
      });
      const intermediateOutput = await this.llmProvider.generateText(
        INITIAL_SUMMARY_PROMPT,
        transcript,
        { jsonMode: true },
      );

      // Step 5: Select project (if not already specified)
      let selectedProject: PortalProject | null = null;
      if (job.projectId) {
        selectedProject = await this.portalClient.getProject(job.projectId);
      } else {
        selectedProject = await this.autoSelectProject(intermediateOutput);
      }

      if (selectedProject) {
        this.updateJob(job.id, {
          status: "selecting_project",
          progress: {
            stage: "selecting_project",
            message: `Selected project: ${selectedProject.name}`,
            transcript,
            intermediateOutput,
          },
        });
      }

      // Step 6: Execute task via MCP
      this.updateJob(job.id, {
        status: "executing_task",
        progress: {
          stage: "executing_task",
          message: "Executing task via MCP tools...",
          transcript,
          intermediateOutput,
        },
      });

      // Determine which MCP servers to use
      const serversToUse =
        selectedProject?.mcpServers ?? this.mcpServers;

      const orchestrator = new MCPOrchestrator(
        this.llmProvider,
        serversToUse,
      );

      const customPrompt = selectedProject?.skillDetails;
      const systemPrompt = buildTaskExecutionPrompt(customPrompt);

      const result = await orchestrator.processMessage(intermediateOutput, {
        systemPrompt,
      });

      orchestrator.disconnectAll();

      // Step 7: Complete
      this.updateJob(job.id, {
        status: "completed",
        result: {
          transcript,
          intermediateOutput,
          finalOutput: result.final ?? "No result produced",
          projectId: selectedProject?.id,
          projectName: selectedProject?.name,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[VideoProcessor] Job ${job.id} failed:`, errorMessage);

      this.updateJob(job.id, {
        status: "failed",
        error: errorMessage,
      });
    } finally {
      // Clean up temp files
      await this.cleanupFiles(videoPath, audioPath);
    }
  }

  private async autoSelectProject(
    intermediateOutput: string,
  ): Promise<PortalProject | null> {
    try {
      const projects = await this.portalClient.getProjects();
      if (projects.length === 0) return null;
      if (projects.length === 1) return projects[0];

      // Use LLM to select the best project
      const projectList = projects
        .map((p) => `- ID: ${p.id}, Name: ${p.name}, Skills: ${p.skillDetails}`)
        .join("\n");

      const prompt = `Transcript Analysis:\n${intermediateOutput}\n\nAvailable Projects:\n${projectList}`;

      const selectionResult = await this.llmProvider.generateText(
        PROJECT_SELECTION_PROMPT,
        prompt,
        { jsonMode: true },
      );

      const parsed = JSON.parse(selectionResult);
      if (parsed.selectedProjectId) {
        return (
          projects.find((p) => p.id === parsed.selectedProjectId) ?? null
        );
      }

      return null;
    } catch (error) {
      console.warn("[VideoProcessor] Auto-select project failed:", error);
      return null;
    }
  }

  private updateJob(id: string, updates: Partial<VideoJob>): void {
    jobStore.update(id, updates);
  }

  private async cleanupFiles(...files: string[]): Promise<void> {
    await Promise.all(
      files.map((f) =>
        fs.promises.unlink(f).catch(() => {
          /* ignore missing files */
        }),
      ),
    );
  }
}

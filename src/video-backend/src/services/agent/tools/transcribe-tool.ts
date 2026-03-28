import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentTool, StorageProvider } from "../../../types/index.js";
import { getFFmpegService } from "../../ffmpeg/index.js";
import { getTranscriptionProvider } from "../../transcription/index.js";

/**
 * Tool that downloads a video from S3, extracts audio, and transcribes it.
 * The agent decides when and whether to use this.
 */
export function createTranscribeTool(
  storageProvider: StorageProvider,
): AgentTool {
  return {
    name: "transcribe_video",
    description:
      "Download a video from storage, extract audio, and transcribe it to text. " +
      "Returns the full transcript. Use this as the first step to understand what the video is about.",
    parameters: {
      type: "object",
      properties: {
        video_key: {
          type: "string",
          description:
            "The S3 storage key of the video file to transcribe",
        },
      },
      required: ["video_key"],
    },
    async execute(args) {
      const videoKey = args.video_key as string;
      const tmpDir = os.tmpdir();
      const videoPath = path.join(tmpDir, `transcribe-${Date.now()}-video`);
      const audioPath = path.join(tmpDir, `transcribe-${Date.now()}-audio.mp3`);

      try {
        // Download from S3
        await storageProvider.download(videoKey, videoPath);

        // Extract audio
        const ffmpeg = getFFmpegService();
        await ffmpeg.convertVideoToMp3(videoPath, audioPath);

        // Transcribe
        const transcription = getTranscriptionProvider();
        const transcript = await transcription.transcribe(audioPath);

        return transcript;
      } finally {
        // Cleanup
        await fs.promises.unlink(videoPath).catch(() => {});
        await fs.promises.unlink(audioPath).catch(() => {});
      }
    },
  };
}

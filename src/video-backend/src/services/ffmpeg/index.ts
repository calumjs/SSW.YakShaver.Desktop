import { execFile } from "node:child_process";
import { promisify } from "node:util";
import which from "which";

const execFileAsync = promisify(execFile);

export class FFmpegService {
  private ffmpegPath: string | null = null;

  async resolvePath(): Promise<string> {
    if (this.ffmpegPath) return this.ffmpegPath;

    try {
      this.ffmpegPath = await which("ffmpeg");
    } catch {
      throw new Error(
        "FFmpeg not found in PATH. Ensure FFmpeg is installed in the Docker container.",
      );
    }

    return this.ffmpegPath;
  }

  async convertVideoToMp3(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    const ffmpeg = await this.resolvePath();

    await execFileAsync(ffmpeg, [
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      "-b:a",
      "192k",
      "-y",
      outputPath,
    ]);
  }
}

let instance: FFmpegService | null = null;

export function getFFmpegService(): FFmpegService {
  if (!instance) {
    instance = new FFmpegService();
  }
  return instance;
}

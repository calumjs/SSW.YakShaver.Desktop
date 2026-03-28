import fs from "node:fs";
import OpenAI from "openai";
import { config } from "../../config/index.js";
import type { TranscriptionProvider } from "../../types/index.js";

export class WhisperTranscriptionProvider implements TranscriptionProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const cfg = config.llm;

    if (config.transcription.provider === "azure-whisper") {
      this.client = new OpenAI({
        apiKey: cfg.azureApiKey,
        baseURL: `${cfg.azureEndpoint}/openai/deployments/${cfg.azureDeployment}`,
        defaultQuery: { "api-version": cfg.azureApiVersion },
        defaultHeaders: { "api-key": cfg.azureApiKey },
      });
    } else {
      this.client = new OpenAI({ apiKey: cfg.openaiApiKey });
    }

    this.model = config.transcription.whisperModel ?? "whisper-1";
  }

  async transcribe(audioFilePath: string): Promise<string> {
    const fileStream = fs.createReadStream(audioFilePath);

    const response = await this.client.audio.transcriptions.create({
      model: this.model,
      file: fileStream,
      response_format: "vtt",
    });

    return response as unknown as string;
  }
}

let instance: TranscriptionProvider | null = null;

export function getTranscriptionProvider(): TranscriptionProvider {
  if (!instance) {
    instance = new WhisperTranscriptionProvider();
  }
  return instance;
}

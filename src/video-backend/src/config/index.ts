import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: Number(optional("PORT", "3001")),
  nodeEnv: optional("NODE_ENV", "development"),

  // LLM Configuration
  llm: {
    provider: optional("LLM_PROVIDER", "openai") as "openai" | "azure" | "claude",
    // OpenAI
    openaiApiKey: optional("OPENAI_API_KEY"),
    openaiModel: optional("OPENAI_MODEL", "gpt-4o"),
    // Azure OpenAI
    azureApiKey: optional("AZURE_OPENAI_API_KEY"),
    azureEndpoint: optional("AZURE_OPENAI_ENDPOINT"),
    azureDeployment: optional("AZURE_OPENAI_DEPLOYMENT"),
    azureApiVersion: optional("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
    // Claude
    claudeApiKey: optional("ANTHROPIC_API_KEY"),
    claudeModel: optional("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
  },

  // Transcription
  transcription: {
    provider: optional("TRANSCRIPTION_PROVIDER", "openai-whisper") as
      | "openai-whisper"
      | "azure-whisper",
    // Whisper uses the same OpenAI/Azure config as above
    whisperModel: optional("WHISPER_MODEL", "whisper-1"),
  },

  // S3-compatible storage
  storage: {
    endpoint: optional("S3_ENDPOINT"),
    region: optional("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET"),
    accessKeyId: optional("S3_ACCESS_KEY_ID"),
    secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: optional("S3_FORCE_PATH_STYLE", "true") === "true",
  },

  // Azure Service Bus
  queue: {
    connectionString: required("AZURE_SERVICE_BUS_CONNECTION_STRING"),
    queueName: optional("AZURE_SERVICE_BUS_QUEUE_NAME", "video-processing"),
  },

  // Portal (SSW.YakShaver API)
  portal: {
    baseUrl: optional("PORTAL_BASE_URL"),
    apiKey: optional("PORTAL_API_KEY"),
  },

  // Upload limits
  upload: {
    maxFileSizeMb: Number(optional("MAX_FILE_SIZE_MB", "500")),
    allowedMimeTypes: [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-matroska",
    ],
  },
} as const;

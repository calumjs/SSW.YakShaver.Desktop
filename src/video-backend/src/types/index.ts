export interface VideoJob {
  id: string;
  status: JobStatus;
  projectId?: string;
  videoKey: string;
  createdAt: Date;
  updatedAt: Date;
  progress?: JobProgress;
  result?: JobResult;
  error?: string;
}

export type JobStatus =
  | "queued"
  | "uploading"
  | "converting_audio"
  | "transcribing"
  | "analyzing"
  | "selecting_project"
  | "executing_task"
  | "completed"
  | "failed";

export interface JobProgress {
  stage: JobStatus;
  message?: string;
  transcript?: string;
  intermediateOutput?: string;
}

export interface JobResult {
  transcript: string;
  intermediateOutput: string;
  finalOutput: string;
  projectId?: string;
  projectName?: string;
}

export interface PortalProject {
  id: string;
  name: string;
  skillDetails: string;
  mcpServers?: MCPServerConfig[];
}

export interface MCPServerConfig {
  name: string;
  transport: "streamableHttp" | "stdio";
  url: string;
  headers?: Record<string, string>;
  version?: string;
  timeoutMs?: number;
}

export interface LLMProvider {
  generateText(
    systemPrompt: string,
    userMessage: string,
    options?: LLMOptions,
  ): Promise<string>;
  sendMessageWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
  ): Promise<LLMResponse>;
  isConfigured(): boolean;
}

export interface LLMOptions {
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content: string | null;
  toolCalls: LLMToolCall[] | null;
  finishReason: "stop" | "tool_calls" | "length" | string;
}

export interface TranscriptionProvider {
  transcribe(audioFilePath: string): Promise<string>;
}

export interface StorageProvider {
  upload(key: string, filePath: string, contentType?: string): Promise<string>;
  download(key: string, destPath: string): Promise<void>;
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string>;
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface PortalClient {
  getProjects(): Promise<PortalProject[]>;
  getProject(id: string): Promise<PortalProject | null>;
}

export interface QueueService {
  enqueue(job: VideoJob): Promise<void>;
  processMessages(
    handler: (job: VideoJob) => Promise<void>,
  ): Promise<void>;
  close(): Promise<void>;
}

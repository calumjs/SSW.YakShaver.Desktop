// ---- Job types ----

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
  | "processing"
  | "completed"
  | "failed";

export interface JobProgress {
  stage: string;
  message?: string;
  thinkingExcerpt?: string;
  toolCalls?: AgentToolCallRecord[];
}

export interface AgentToolCallRecord {
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  timestamp: number;
}

export interface JobResult {
  finalOutput: string;
  transcript?: string;
  projectId?: string;
  projectName?: string;
  toolCallCount: number;
  turnCount: number;
}

// ---- Portal types ----

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

// ---- LLM types ----

export interface LLMProvider {
  sendMessages(
    messages: LLMMessage[],
    tools: LLMToolDef[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse>;
  isConfigured(): boolean;
}

export interface LLMRequestOptions {
  maxTokens?: number;
  /** Enable extended thinking (Claude only). Budget in tokens. */
  thinkingBudget?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  thinking?: string;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

export interface LLMToolDef {
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
  thinking: string | null;
  toolCalls: LLMToolCall[] | null;
  finishReason: "stop" | "tool_calls" | "length" | string;
}

// ---- Agent types ----

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<string>;
}

export type AgentEventType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "assistant_message"
  | "turn_complete"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  message?: string;
  thinking?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  toolError?: string;
  turnNumber?: number;
  timestamp: number;
}

export type AgentEventListener = (event: AgentEvent) => void;

// ---- Infrastructure types ----

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

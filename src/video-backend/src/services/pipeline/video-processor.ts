import type {
  AgentToolCallRecord,
  LLMProvider,
  MCPServerConfig,
  PortalClient,
  StorageProvider,
  VideoJob,
} from "../../types/index.js";
import { AgentLoop } from "../agent/agent-loop.js";
import { buildAgentSystemPrompt } from "../agent/system-prompt.js";
import { createMCPBridgeTools } from "../agent/tools/mcp-tools.js";
import {
  createGetProjectTool,
  createListProjectsTool,
} from "../agent/tools/portal-tools.js";
import { createTranscribeTool } from "../agent/tools/transcribe-tool.js";
import { jobStore } from "./job-store.js";

export interface VideoProcessorConfig {
  llmProvider: LLMProvider;
  storageProvider: StorageProvider;
  portalClient: PortalClient;
  defaultMcpServers: MCPServerConfig[];
  /** Token budget for extended thinking (Claude). 0 = disabled. */
  thinkingBudget?: number;
  /** Max agentic turns */
  maxTurns?: number;
}

export class VideoProcessor {
  private config: VideoProcessorConfig;

  constructor(config: VideoProcessorConfig) {
    this.config = config;
  }

  async process(job: VideoJob): Promise<void> {
    const toolCallRecords: AgentToolCallRecord[] = [];

    try {
      jobStore.update(job.id, {
        status: "processing",
        progress: {
          stage: "initializing",
          message: "Starting agentic processing...",
        },
      });

      // Build the agent
      const agent = new AgentLoop(this.config.llmProvider, {
        maxTurns: this.config.maxTurns ?? 50,
        thinkingBudget: this.config.thinkingBudget ?? 10000,
        maxTokens: 16384,
      });

      // Register built-in tools
      agent.addTool(createTranscribeTool(this.config.storageProvider));
      agent.addTool(createListProjectsTool(this.config.portalClient));
      agent.addTool(createGetProjectTool(this.config.portalClient));

      // Register MCP bridge tools from default servers
      const mcpTools = await createMCPBridgeTools(
        this.config.defaultMcpServers,
      );
      agent.addTools(mcpTools);

      // Listen to agent events and update job progress
      agent.onEvent((event) => {
        switch (event.type) {
          case "thinking":
            jobStore.update(job.id, {
              progress: {
                stage: "thinking",
                message: "Agent is reasoning...",
                thinkingExcerpt: event.thinking?.slice(0, 200),
                toolCalls: toolCallRecords,
              },
            });
            break;

          case "tool_call":
            toolCallRecords.push({
              tool: event.toolName ?? "unknown",
              args: event.toolArgs,
              timestamp: event.timestamp,
            });
            jobStore.update(job.id, {
              progress: {
                stage: `calling ${event.toolName}`,
                message: `Using tool: ${event.toolName}`,
                toolCalls: toolCallRecords,
              },
            });
            break;

          case "tool_result": {
            const lastRecord = toolCallRecords[toolCallRecords.length - 1];
            if (lastRecord) {
              lastRecord.result = event.toolResult?.slice(0, 500);
              lastRecord.error = event.toolError;
            }
            break;
          }

          case "assistant_message":
            jobStore.update(job.id, {
              progress: {
                stage: "responding",
                message: event.message?.slice(0, 200),
                toolCalls: toolCallRecords,
              },
            });
            break;

          case "error":
            console.error(`[Agent] Error in job ${job.id}:`, event.message);
            break;
        }
      });

      // Build the user message - this is what kicks off the agent
      const userMessage = buildUserMessage(job);

      // Build system prompt with optional project hint
      const systemPrompt = buildAgentSystemPrompt({
        projectHint: job.projectId,
      });

      // Run the agent
      console.log(`[VideoProcessor] Starting agent for job ${job.id}`);
      const result = await agent.run(systemPrompt, userMessage);
      console.log(
        `[VideoProcessor] Agent completed job ${job.id} in ${result.turnCount} turns, ${result.toolCallCount} tool calls`,
      );

      // Extract transcript from tool call records
      const transcribeRecord = toolCallRecords.find(
        (r) => r.tool === "transcribe_video",
      );

      jobStore.update(job.id, {
        status: "completed",
        result: {
          finalOutput: result.finalOutput ?? "Agent produced no output",
          transcript: transcribeRecord?.result,
          toolCallCount: result.toolCallCount,
          turnCount: result.turnCount,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[VideoProcessor] Job ${job.id} failed:`, errorMessage);

      jobStore.update(job.id, {
        status: "failed",
        error: errorMessage,
        progress: {
          stage: "failed",
          message: errorMessage,
          toolCalls: toolCallRecords,
        },
      });
    }
  }
}

function buildUserMessage(job: VideoJob): string {
  const parts: string[] = [];

  parts.push(
    `Process the video stored at key: "${job.videoKey}"`,
  );

  if (job.projectId) {
    parts.push(
      `The user has indicated this relates to project ID: "${job.projectId}". Verify this with the portal and use the appropriate project context.`,
    );
  } else {
    parts.push(
      "The user did not specify a project. After transcribing, determine the most relevant project from the portal based on the transcript content.",
    );
  }

  parts.push(
    "\nStart by transcribing the video, then analyze the content and execute the appropriate task.",
  );

  return parts.join("\n");
}

import type {
  LLMMessage,
  LLMProvider,
  LLMTool,
  MCPServerConfig,
} from "../../types/index.js";
import { MCPClientWrapper } from "./mcp-client-wrapper.js";

export interface MCPStepEvent {
  type: "start" | "tool_call" | "tool_result" | "final_result";
  message?: string;
  toolName?: string;
  serverName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  timestamp?: number;
}

export type StepListener = (event: MCPStepEvent) => void;

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export class MCPOrchestrator {
  private clients = new Map<string, MCPClientWrapper>();
  private stepListeners: StepListener[] = [];

  constructor(
    private llmProvider: LLMProvider,
    private servers: MCPServerConfig[],
  ) {}

  onStep(listener: StepListener): void {
    this.stepListeners.push(listener);
  }

  private emitStep(event: MCPStepEvent): void {
    for (const listener of this.stepListeners) {
      listener(event);
    }
  }

  private getClient(name: string): MCPClientWrapper {
    const existing = this.clients.get(name);
    if (existing) return existing;

    const config = this.servers.find((s) => s.name === name);
    if (!config) throw new Error(`Server '${name}' not found`);

    const client = new MCPClientWrapper(config);
    this.clients.set(name, client);
    return client;
  }

  async connectAll(): Promise<void> {
    for (const server of this.servers) {
      try {
        const client = this.getClient(server.name);
        await client.connect();
      } catch (e) {
        console.error(
          `[MCPOrchestrator] Failed to connect to '${server.name}':`,
          e,
        );
      }
    }
  }

  async processMessage(
    prompt: string,
    options: {
      serverFilter?: string[];
      systemPrompt?: string;
      maxToolIterations?: number;
    } = {},
  ): Promise<{ final: string | null; transcript: LLMMessage[] }> {
    if (!this.llmProvider.isConfigured()) {
      throw new Error("LLM provider is not configured.");
    }

    const targetServers = options.serverFilter?.length
      ? this.servers.filter((s) => options.serverFilter!.includes(s.name))
      : this.servers;

    // Gather tools from MCP servers
    const toolDefs: LLMTool[] = [];
    for (const server of targetServers) {
      const client = this.getClient(server.name);
      try {
        await client.connect();
        const toolList = await client.listTools();
        const sanitizedServerName = sanitizeName(server.name);

        for (const tool of toolList.tools ?? []) {
          const sanitizedToolName = sanitizeName(tool.name);
          toolDefs.push({
            type: "function",
            function: {
              name: `${sanitizedServerName}__${sanitizedToolName}`,
              description:
                tool.description || `Tool ${tool.name} from ${server.name}`,
              parameters: tool.inputSchema || {
                type: "object",
                properties: {},
              },
            },
          });
        }
      } catch (e) {
        console.warn(
          `[MCPOrchestrator] Failed to load server ${server.name}`,
          e,
        );
      }
    }

    const systemPrompt =
      options.systemPrompt ??
      "You are a helpful AI that can call tools. Use the provided tools to satisfy the user request.";

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    this.emitStep({ type: "start", message: "Start execute task" });

    const maxIterations = options.maxToolIterations ?? 30;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const response = await this.llmProvider.sendMessageWithTools(
        messages,
        toolDefs,
      );

      // Add assistant message to transcript
      const assistantMsg: LLMMessage = {
        role: "assistant",
        content: response.content,
        ...(response.toolCalls && { tool_calls: response.toolCalls }),
      };
      messages.push(assistantMsg);

      if (response.finishReason === "stop") {
        this.emitStep({
          type: "final_result",
          message: "Generate final result",
        });
        return { final: response.content, transcript: messages };
      }

      if (!response.toolCalls?.length) {
        console.warn(
          "[MCPOrchestrator] No tool calls and not finished; aborting loop.",
        );
        break;
      }

      for (const tc of response.toolCalls) {
        const [serverName, toolName] = tc.function.name.split("__", 2);
        if (!serverName || !toolName) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Unable to parse tool routing for ${tc.function.name}`,
          });
          continue;
        }

        const originalServerName =
          this.servers.find((s) => sanitizeName(s.name) === serverName)?.name ??
          serverName;

        const args = tc.function.arguments
          ? JSON.parse(tc.function.arguments)
          : {};

        this.emitStep({
          type: "tool_call",
          toolName,
          serverName: originalServerName,
          args,
          timestamp: Date.now(),
        });

        try {
          const client = this.getClient(
            this.servers.find((s) => sanitizeName(s.name) === serverName)
              ?.name ?? serverName,
          );
          const result = await client.callTool(toolName, args);

          this.emitStep({
            type: "tool_result",
            toolName,
            serverName: originalServerName,
            result,
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          this.emitStep({
            type: "tool_result",
            toolName,
            serverName: originalServerName,
            error: String(err),
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Tool call failed: ${String(err)}`,
          });
        }
      }
    }

    return { final: null, transcript: messages };
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
  }
}

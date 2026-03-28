import type {
  AgentEvent,
  AgentEventListener,
  AgentTool,
  LLMMessage,
  LLMProvider,
  LLMRequestOptions,
  LLMToolDef,
} from "../../types/index.js";

export interface AgentLoopOptions {
  /** Maximum number of agentic turns (each turn = one LLM call) */
  maxTurns?: number;
  /** Token budget for extended thinking (Claude only, 0 = disabled) */
  thinkingBudget?: number;
  /** Max tokens for LLM response */
  maxTokens?: number;
}

export interface AgentLoopResult {
  finalOutput: string | null;
  turnCount: number;
  toolCallCount: number;
  transcript: LLMMessage[];
}

/**
 * AgentLoop - A Claude Code-style autonomous agent.
 *
 * Given a system prompt, user message, and a set of tools, the agent:
 * 1. Sends the conversation to the LLM
 * 2. If the LLM returns tool calls, executes them and feeds results back
 * 3. Repeats until the LLM produces a final text response (no more tool calls)
 *
 * The agent reasons autonomously about what tools to call, in what order,
 * and how to interpret results - just like Claude Code.
 */
export class AgentLoop {
  private listeners: AgentEventListener[] = [];
  private tools = new Map<string, AgentTool>();
  private toolDefs: LLMToolDef[] = [];

  constructor(
    private llm: LLMProvider,
    private options: AgentLoopOptions = {},
  ) {}

  /** Register a tool the agent can use */
  addTool(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
    this.toolDefs.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }

  /** Register multiple tools */
  addTools(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.addTool(tool);
    }
  }

  /** Listen to agent events (thinking, tool calls, results, etc.) */
  onEvent(listener: AgentEventListener): void {
    this.listeners.push(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Run the agentic loop.
   * The agent autonomously decides what to do based on the system prompt and user message.
   */
  async run(
    systemPrompt: string,
    userMessage: string,
  ): Promise<AgentLoopResult> {
    const maxTurns = this.options.maxTurns ?? 50;
    const requestOptions: LLMRequestOptions = {
      maxTokens: this.options.maxTokens ?? 16384,
      thinkingBudget: this.options.thinkingBudget,
    };

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    let turnCount = 0;
    let toolCallCount = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
      turnCount++;

      const response = await this.llm.sendMessages(
        messages,
        this.toolDefs,
        requestOptions,
      );

      // Emit thinking event if present
      if (response.thinking) {
        this.emit({
          type: "thinking",
          thinking: response.thinking,
          turnNumber: turnCount,
          timestamp: Date.now(),
        });
      }

      // Emit assistant message if present
      if (response.content) {
        this.emit({
          type: "assistant_message",
          message: response.content,
          turnNumber: turnCount,
          timestamp: Date.now(),
        });
      }

      // Build assistant message for transcript
      const assistantMsg: LLMMessage = {
        role: "assistant",
        content: response.content,
        thinking: response.thinking ?? undefined,
        ...(response.toolCalls && { tool_calls: response.toolCalls }),
      };
      messages.push(assistantMsg);

      // If no tool calls, the agent is done
      if (!response.toolCalls?.length || response.finishReason === "stop") {
        this.emit({
          type: "turn_complete",
          message: response.content ?? "Agent completed with no output",
          turnNumber: turnCount,
          timestamp: Date.now(),
        });

        return {
          finalOutput: response.content,
          turnCount,
          toolCallCount,
          transcript: messages,
        };
      }

      // Execute each tool call
      for (const tc of response.toolCalls) {
        toolCallCount++;
        const toolName = tc.function.name;
        const tool = this.tools.get(toolName);

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        this.emit({
          type: "tool_call",
          toolName,
          toolArgs: args,
          turnNumber: turnCount,
          timestamp: Date.now(),
        });

        if (!tool) {
          const errorMsg = `Unknown tool: ${toolName}. Available tools: ${Array.from(this.tools.keys()).join(", ")}`;
          this.emit({
            type: "tool_result",
            toolName,
            toolError: errorMsg,
            turnNumber: turnCount,
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: ${errorMsg}`,
          });
          continue;
        }

        try {
          const result = await tool.execute(args);

          // Truncate very large results to avoid blowing up context
          const truncatedResult =
            result.length > 50000
              ? `${result.slice(0, 50000)}\n\n[Output truncated - ${result.length} chars total]`
              : result;

          this.emit({
            type: "tool_result",
            toolName,
            toolResult:
              truncatedResult.length > 500
                ? `${truncatedResult.slice(0, 500)}...`
                : truncatedResult,
            turnNumber: turnCount,
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncatedResult,
          });
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : String(err);

          this.emit({
            type: "tool_result",
            toolName,
            toolError: errorMsg,
            turnNumber: turnCount,
            timestamp: Date.now(),
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error executing tool: ${errorMsg}`,
          });
        }
      }
    }

    // Exhausted max turns
    this.emit({
      type: "error",
      message: `Agent reached maximum turn limit (${maxTurns})`,
      timestamp: Date.now(),
    });

    return {
      finalOutput: messages[messages.length - 1]?.content ?? null,
      turnCount,
      toolCallCount,
      transcript: messages,
    };
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index.js";
import type {
  LLMMessage,
  LLMProvider,
  LLMRequestOptions,
  LLMResponse,
  LLMToolDef,
} from "../../types/index.js";

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: config.llm.claudeApiKey });
    this.model = config.llm.claudeModel ?? "claude-sonnet-4-20250514";
  }

  isConfigured(): boolean {
    return !!config.llm.claudeApiKey;
  }

  async sendMessages(
    messages: LLMMessage[],
    tools: LLMToolDef[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const anthropicMessages = this.convertMessages(nonSystemMessages);
    const anthropicTools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
    }));

    const maxTokens = options?.maxTokens ?? 16384;

    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: maxTokens,
      ...(systemMsg?.content && { system: systemMsg.content }),
      messages: anthropicMessages,
      ...(anthropicTools.length > 0 && { tools: anthropicTools }),
    };

    // Extended thinking support
    if (options?.thinkingBudget && options.thinkingBudget > 0) {
      requestParams.thinking = {
        type: "enabled",
        budget_tokens: options.thinkingBudget,
      };
    }

    const response = await this.client.messages.create(requestParams);

    // Extract thinking, text, and tool_use blocks
    let thinking: string | null = null;
    const textParts: string[] = [];
    const toolUseBlocks: Array<{
      id: string;
      name: string;
      input: unknown;
    }> = [];

    for (const block of response.content) {
      if (block.type === "thinking") {
        thinking = block.thinking;
      } else if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    const content = textParts.length > 0 ? textParts.join("") : null;

    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((b) => ({
            id: b.id,
            type: "function" as const,
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input),
            },
          }))
        : null;

    return {
      content,
      thinking,
      toolCalls,
      finishReason:
        response.stop_reason === "end_turn"
          ? "stop"
          : response.stop_reason === "tool_use"
            ? "tool_calls"
            : response.stop_reason ?? "stop",
    };
  }

  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];

        // Re-emit thinking block if present (required by Anthropic API)
        if (msg.thinking) {
          content.push({
            type: "thinking",
            thinking: msg.thinking,
          } as Anthropic.ContentBlockParam);
        }

        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
        }
        result.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id!,
              content: msg.content ?? "",
            },
          ],
        });
      } else if (msg.role === "user") {
        result.push({ role: "user", content: msg.content ?? "" });
      }
    }

    return result;
  }
}

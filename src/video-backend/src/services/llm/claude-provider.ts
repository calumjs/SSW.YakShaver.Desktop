import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index.js";
import type {
  LLMMessage,
  LLMOptions,
  LLMProvider,
  LLMResponse,
  LLMTool,
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

  async generateText(
    systemPrompt: string,
    userMessage: string,
    options?: LLMOptions,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }

  async sendMessageWithTools(
    messages: LLMMessage[],
    tools: LLMTool[],
  ): Promise<LLMResponse> {
    // Extract system prompt from messages
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertMessages(nonSystemMessages);

    // Convert tools to Anthropic format
    const anthropicTools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function
        .parameters as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      ...(systemMsg?.content && { system: systemMsg.content }),
      messages: anthropicMessages,
      ...(anthropicTools.length > 0 && { tools: anthropicTools }),
    });

    // Convert response back to common format
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use",
    );

    const content =
      textBlocks.length > 0
        ? textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("")
        : null;

    const toolCalls =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map((b) => {
            if (b.type !== "tool_use") throw new Error("Unexpected block type");
            return {
              id: b.id,
              type: "function" as const,
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            };
          })
        : null;

    return {
      content,
      toolCalls,
      finishReason:
        response.stop_reason === "end_turn"
          ? "stop"
          : response.stop_reason === "tool_use"
            ? "tool_calls"
            : response.stop_reason ?? "stop",
    };
  }

  private convertMessages(
    messages: LLMMessage[],
  ): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
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

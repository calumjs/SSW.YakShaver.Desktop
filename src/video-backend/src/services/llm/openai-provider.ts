import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/index.js";
import { config } from "../../config/index.js";
import type {
  LLMMessage,
  LLMProvider,
  LLMRequestOptions,
  LLMResponse,
  LLMToolDef,
} from "../../types/index.js";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const cfg = config.llm;

    if (cfg.provider === "azure") {
      this.client = new OpenAI({
        apiKey: cfg.azureApiKey,
        baseURL: `${cfg.azureEndpoint}/openai/deployments/${cfg.azureDeployment}`,
        defaultQuery: { "api-version": cfg.azureApiVersion },
        defaultHeaders: { "api-key": cfg.azureApiKey },
      });
      this.model = cfg.azureDeployment ?? "gpt-4o";
    } else {
      this.client = new OpenAI({ apiKey: cfg.openaiApiKey });
      this.model = cfg.openaiModel ?? "gpt-4o";
    }
  }

  isConfigured(): boolean {
    const cfg = config.llm;
    if (cfg.provider === "azure") {
      return !!(cfg.azureApiKey && cfg.azureEndpoint && cfg.azureDeployment);
    }
    return !!cfg.openaiApiKey;
  }

  async sendMessages(
    messages: LLMMessage[],
    tools: LLMToolDef[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    const openaiMessages = messages.map(
      (m) =>
        ({
          role: m.role,
          content: m.content,
          ...(m.tool_calls && { tool_calls: m.tool_calls }),
          ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        }) as ChatCompletionMessageParam,
    );

    const openaiTools = tools as ChatCompletionTool[];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      ...(options?.maxTokens && { max_tokens: options.maxTokens }),
    });

    const choice = response.choices[0];
    const msg = choice?.message;

    return {
      content: msg?.content ?? null,
      thinking: null, // OpenAI doesn't support extended thinking
      toolCalls: msg?.tool_calls
        ? msg.tool_calls
            .filter(
              (
                tc,
              ): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
                type: "function";
              } => tc.type === "function",
            )
            .map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }))
        : null,
      finishReason: choice?.finish_reason ?? "stop",
    };
  }
}

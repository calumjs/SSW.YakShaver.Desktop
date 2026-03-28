import { config } from "../../config/index.js";
import type { LLMProvider } from "../../types/index.js";
import { ClaudeProvider } from "./claude-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

let instance: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (instance) return instance;

  const provider = config.llm.provider;

  switch (provider) {
    case "claude":
      instance = new ClaudeProvider();
      break;
    case "openai":
    case "azure":
      instance = new OpenAIProvider();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }

  if (!instance.isConfigured()) {
    throw new Error(
      `LLM provider '${provider}' is not properly configured. Check environment variables.`,
    );
  }

  return instance;
}

export function resetLLMProvider(): void {
  instance = null;
}

export type ChromeDevtoolsConfig = {
  testModeEnabled?: boolean;
  browserUrl?: string;
  consoleLogLimit?: number;
  networkLogLimit?: number;
};

export type MCPServerConfig = {
  name: string;
  description?: string;
  transport: "streamableHttp" | "stdio";
  url: string; // For HTTP-based transports
  headers?: Record<string, string>;
  version?: string;
  timeoutMs?: number;
  chromeDevtools?: ChromeDevtoolsConfig;
};

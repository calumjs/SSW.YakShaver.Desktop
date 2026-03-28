import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig } from "../../types/index.js";

export class MCPClientWrapper {
  readonly name: string;
  private config: MCPServerConfig;
  private client: Client | null = null;
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.name = config.name;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (this.config.transport !== "streamableHttp") {
      throw new Error(
        `Transport '${this.config.transport}' is not supported in the cloud backend. Only 'streamableHttp' is supported.`,
      );
    }

    this.client = new Client(
      { name: `yakshaver-backend-${this.name}`, version: "1.0.0" },
      { capabilities: {} },
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.config.headers ?? {}),
    };

    const transport = new StreamableHTTPClientTransport(
      new URL(this.config.url),
      { requestInit: { headers } },
    );

    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools() {
    if (!this.client) throw new Error(`Client '${this.name}' not connected`);
    return this.client.listTools();
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ) {
    if (!this.client) throw new Error(`Client '${this.name}' not connected`);
    return this.client.callTool({ name: toolName, arguments: args });
  }

  disconnect(): void {
    if (this.client) {
      void this.client.close();
      this.client = null;
      this.connected = false;
    }
  }
}

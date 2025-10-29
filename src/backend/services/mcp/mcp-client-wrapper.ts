import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig } from "./types";

export class MCPClientWrapper {
  private client: Client;
  private transport: StreamableHTTPClientTransport | StdioClientTransport;
  private readonly serverConfig: MCPServerConfig;
  private isConnected = false;

  constructor(opts: MCPServerConfig) {
    this.serverConfig = opts;
    this.client = new Client({
      name: this.serverConfig.name,
      version: this.serverConfig.version || "1.0.0",
    });
    this.transport = this.buildTransport();
  }

  private buildTransport(): StreamableHTTPClientTransport | StdioClientTransport {
    if (this.serverConfig.transport === "streamableHttp") {
      const headers: Record<string, string> = {};
      if (this.serverConfig.headers) {
        for (const [k, v] of Object.entries(this.serverConfig.headers)) {
          headers[k] = v;
        }
      }
      const options: StreamableHTTPClientTransportOptions = {
        requestInit: { headers },
      };
      return new StreamableHTTPClientTransport(new URL(this.serverConfig.url), options);
    } else if (this.serverConfig.transport === "stdio") {
      return new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args,
        env: this.serverConfig.env,
        cwd: this.serverConfig.cwd,
        stderr: this.serverConfig.stderr,
      });
    }
    throw new Error(`Unsupported transport: ${this.serverConfig.transport}`);
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.serverConfig.transport === "streamableHttp") {
      console.log(`[MCP] Connecting to '${this.serverConfig.name}' at ${this.serverConfig.url}...`);
    } else if (this.serverConfig.transport === "stdio") {
      const cmdStr = [this.serverConfig.command, ...(this.serverConfig.args || [])].join(" ");
      console.log(`[MCP] Connecting to '${this.serverConfig.name}' via stdio: ${cmdStr}`);
    }
    await this.client.connect(this.transport);
    this.isConnected = true;
    console.log("[MCP] Connected.");
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.close();
    } catch (e) {
      console.warn(`[MCP] Error while closing client '${this.serverConfig.name}':`, e);
    } finally {
      this.isConnected = false;
    }
  }

  async listTools() {
    return this.client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return this.client.callTool({ name, arguments: args });
  }

  get name() {
    return this.serverConfig.name;
  }
}

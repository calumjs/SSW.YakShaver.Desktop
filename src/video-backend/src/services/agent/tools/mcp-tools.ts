import type { AgentTool, MCPServerConfig } from "../../../types/index.js";
import { MCPClientWrapper } from "../../mcp/mcp-client-wrapper.js";

/**
 * Creates agent tools that bridge to MCP servers.
 *
 * This is the key integration: the agent gets one tool per MCP server tool,
 * and can call any of them autonomously during its reasoning loop.
 * Just like Claude Code has tools for reading files, running commands, etc.,
 * this agent has tools from the configured MCP servers.
 */
export async function createMCPBridgeTools(
  servers: MCPServerConfig[],
): Promise<AgentTool[]> {
  const tools: AgentTool[] = [];
  const clients = new Map<string, MCPClientWrapper>();

  for (const server of servers) {
    if (server.transport !== "streamableHttp") {
      console.warn(
        `[MCPBridge] Skipping '${server.name}' - only streamableHttp transport is supported`,
      );
      continue;
    }

    const client = new MCPClientWrapper(server);

    try {
      await client.connect();
      clients.set(server.name, client);

      const toolList = await client.listTools();

      for (const mcpTool of toolList.tools ?? []) {
        const serverPrefix = sanitize(server.name);
        const toolSuffix = sanitize(mcpTool.name);
        const qualifiedName = `mcp__${serverPrefix}__${toolSuffix}`;

        tools.push({
          name: qualifiedName,
          description:
            `[MCP: ${server.name}] ${mcpTool.description || mcpTool.name}`,
          parameters: mcpTool.inputSchema || {
            type: "object",
            properties: {},
          },
          async execute(args) {
            const result = await client.callTool(mcpTool.name, args);
            return JSON.stringify(result, null, 2);
          },
        });
      }

      console.log(
        `[MCPBridge] Loaded ${toolList.tools?.length ?? 0} tools from '${server.name}'`,
      );
    } catch (err) {
      console.error(
        `[MCPBridge] Failed to connect to '${server.name}':`,
        err,
      );
    }
  }

  return tools;
}

/**
 * Disconnect all MCP clients created by bridge tools.
 */
export function disconnectMCPBridgeClients(tools: AgentTool[]): void {
  // The clients are captured in closures, but we can use a registry pattern
  // For now, this is a no-op since clients are managed per-tool.
  // In production, maintain a separate client registry.
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

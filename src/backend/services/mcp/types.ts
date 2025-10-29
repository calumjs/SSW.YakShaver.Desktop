export type MCPServerConfig =
  | {
      name: string;
      description?: string;
      transport: "streamableHttp";
      url: string;
      headers?: Record<string, string>;
      version?: string;
      timeoutMs?: number;
    }
  | {
      name: string;
      description?: string;
      transport: "stdio";
      command: string; // Command to run (e.g., "npx", "uv", "python")
      args?: string[]; // Arguments to pass to the command
      env?: Record<string, string>; // Environment variables
      cwd?: string; // Working directory
      stderr?: "inherit" | "pipe"; // How to handle stderr
      version?: string;
      timeoutMs?: number;
    };

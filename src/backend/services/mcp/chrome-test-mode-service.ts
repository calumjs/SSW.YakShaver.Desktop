import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launch, type LaunchedChrome } from "chrome-launcher";
import { ChromeDevtoolsMonitor, DEFAULT_CONSOLE_LIMIT, DEFAULT_NETWORK_LIMIT, type ChromeCaptureSnapshot } from "./chrome-devtools-monitor";
import type { MCPServerConfig } from "./types";
import { McpStorage } from "../storage/mcp-storage";

export interface ChromeTestModeStatus {
  hasChromeServer: boolean;
  enabled: boolean;
  serverName?: string;
  browserUrl?: string;
  consoleLogLimit: number;
  networkLogLimit: number;
}

const DEFAULT_BROWSER_URL = "http://127.0.0.1:9222";

export class ChromeTestModeService {
  private static instance: ChromeTestModeService;
  private storage = McpStorage.getInstance();
  private monitor = new ChromeDevtoolsMonitor();
  private launchedChrome: LaunchedChrome | null = null;
  private pendingArtifacts = new Map<string, ChromeCaptureSnapshot>();

  static getInstance(): ChromeTestModeService {
    if (!ChromeTestModeService.instance) {
      ChromeTestModeService.instance = new ChromeTestModeService();
    }
    return ChromeTestModeService.instance;
  }

  async getStatus(): Promise<ChromeTestModeStatus> {
    return this.resolveState();
  }

  invalidate(): void {}

  async openMonitoredChrome(): Promise<{
    success: boolean;
    alreadyRunning?: boolean;
    message?: string;
    error?: string;
  }> {
    const state = await this.resolveState();
    if (!state.hasChromeServer) {
      return { success: false, error: "No chrome-devtools MCP server configured." };
    }
    if (!state.enabled) {
      return { success: false, error: "Enable Chrome MCP Test Mode in the MCP settings first." };
    }

    const { port } = this.parseDebuggingAddress(state.browserUrl);
    if (this.launchedChrome && this.launchedChrome.port === port) {
      return {
        success: true,
        alreadyRunning: true,
        message: `Chrome already running on port ${port}`,
      };
    }

    if (this.launchedChrome) {
      try {
        await this.launchedChrome.kill();
      } catch {
        // ignore kill failures
      } finally {
        this.launchedChrome = null;
      }
    }

    try {
      const profileDir = join(tmpdir(), "chrome-mcp-profile");
      await mkdir(profileDir, { recursive: true });

      this.launchedChrome = await launch({
        port,
        startingUrl: "about:blank",
        chromeFlags: [
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profileDir}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-default-apps",
        ],
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to launch Chrome: ${String(error)}`,
      };
    }

    return {
      success: true,
      message: `Chrome launched on port ${port}`,
    };
  }

  async handleRecordingStart(): Promise<void> {
    const state = await this.resolveState();
    if (!state.enabled || !state.browserUrl) {
      return;
    }
    await this.monitor.start(state.browserUrl, {
      consoleLimit: state.consoleLogLimit,
      networkLimit: state.networkLogLimit,
    });
  }

  async handleRecordingStop(filePath?: string): Promise<void> {
    const snapshot = await this.monitor.stop();
    if (!snapshot || !filePath) return;
    this.pendingArtifacts.set(filePath, snapshot);
  }

  consumeArtifacts(filePath: string): ChromeCaptureSnapshot | null {
    const snapshot = this.pendingArtifacts.get(filePath) ?? null;
    if (snapshot) {
      this.pendingArtifacts.delete(filePath);
    }
    return snapshot;
  }

  private async resolveState(): Promise<ChromeTestModeStatus> {
    const servers = await this.storage.getMcpServers();
    const chromeServer = servers.find((server) => this.isChromeServer(server));
    if (!chromeServer) {
      return {
        hasChromeServer: false,
        enabled: false,
        consoleLogLimit: DEFAULT_CONSOLE_LIMIT,
        networkLogLimit: DEFAULT_NETWORK_LIMIT,
      };
    }

    const chromeConfig = chromeServer.chromeDevtools;
    return {
      hasChromeServer: true,
      enabled: Boolean(chromeConfig?.testModeEnabled),
      serverName: chromeServer.name,
      browserUrl: chromeConfig?.browserUrl ?? DEFAULT_BROWSER_URL,
      consoleLogLimit: chromeConfig?.consoleLogLimit ?? DEFAULT_CONSOLE_LIMIT,
      networkLogLimit: chromeConfig?.networkLogLimit ?? DEFAULT_NETWORK_LIMIT,
    };
  }

  private isChromeServer(server: MCPServerConfig): boolean {
    const combinedText = `${server.name ?? ""} ${server.description ?? ""} ${server.url ?? ""}`.toLowerCase();
    return combinedText.includes("chrome-devtools-mcp");
  }

  private parseDebuggingAddress(browserUrl?: string): { hostname: string; port: number } {
    if (!browserUrl) return { hostname: "127.0.0.1", port: 9222 };
    let parsed: URL;
    try {
      parsed = new URL(browserUrl);
    } catch {
      parsed = new URL(`http://${browserUrl}`);
    }
    return {
      hostname: parsed.hostname || "127.0.0.1",
      port: parsed.port ? Number(parsed.port) : 9222,
    };
  }
}

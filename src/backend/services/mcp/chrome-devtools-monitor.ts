import CDP from "chrome-remote-interface";

export interface ChromeConsoleEntry {
  level: string;
  text: string;
  url?: string;
  timestamp: number;
  args?: string[];
}

export interface ChromeNetworkEntry {
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  type?: string;
  startTime?: number;
  endTime?: number;
  errorText?: string;
}

export interface ChromeCaptureSnapshot {
  consoleLogs: ChromeConsoleEntry[];
  networkRequests: ChromeNetworkEntry[];
  startedAt: number;
  finishedAt: number;
}

export const DEFAULT_CONSOLE_LIMIT = 200;
export const DEFAULT_NETWORK_LIMIT = 200;

type ChromeRemoteClient = CDP.Client;

export class ChromeDevtoolsMonitor {
  private client: ChromeRemoteClient | null = null;
  private consoleEntries: ChromeConsoleEntry[] = [];
  private networkEntries: ChromeNetworkEntry[] = [];
  private pendingRequests = new Map<string, ChromeNetworkEntry>();
  private startedAt: number | null = null;
  private consoleLimit = DEFAULT_CONSOLE_LIMIT;
  private networkLimit = DEFAULT_NETWORK_LIMIT;

  async start(
    browserUrl: string,
    options?: { consoleLimit?: number; networkLimit?: number }
  ): Promise<void> {
    await this.stop();
    const { hostname, port } = this.parseDebuggingAddress(browserUrl);

    this.consoleEntries = [];
    this.networkEntries = [];
    this.pendingRequests.clear();
    this.consoleLimit = options?.consoleLimit ?? DEFAULT_CONSOLE_LIMIT;
    this.networkLimit = options?.networkLimit ?? DEFAULT_NETWORK_LIMIT;
    this.startedAt = Date.now();

    try {
      const client = await CDP({
        host: hostname,
        port,
        target: (targets: CDP.Target[]) => {
          const page = targets.find(
            (target) => target.type === "page" && !target.url.startsWith("chrome://")
          );
          return page ?? targets[0] ?? 0;
        },
      } satisfies CDP.Options);
      this.client = client;

      const { Network, Log, Runtime } = client;

      await Promise.all([Network.enable(), Log.enable(), Runtime.enable()]);
      await Network.setCacheDisabled({ cacheDisabled: true }).catch(() => undefined);

      Log.entryAdded((payload: any) => {
        const entry = payload.entry;
        if (!entry) return;
        this.pushConsoleEntry({
          level: entry.level,
          text: entry.text || "",
          url: entry.url,
          timestamp: Date.now(),
        });
      });

      Runtime.consoleAPICalled((payload: any) => {
        const args =
          payload.args?.map((arg: { value?: unknown; description?: string; type?: string }) =>
            this.stringifyConsoleArg(arg)
          ) ?? [];
        this.pushConsoleEntry({
          level: payload.type ?? "log",
          text: args.join(" "),
          url: payload.stackTrace?.callFrames?.[0]?.url,
          timestamp: Date.now(),
          args,
        });
      });

      Network.requestWillBeSent((event: any) => {
        const request: ChromeNetworkEntry = {
          method: event.request?.method,
          url: event.request?.url,
          type: event.type,
          startTime: this.convertTimestamp(event.timestamp),
        };
        this.pendingRequests.set(event.requestId, request);
      });

      Network.responseReceived((event: any) => {
        const entry = this.pendingRequests.get(event.requestId);
        if (!entry) return;
        entry.status = event.response?.status;
        entry.statusText = event.response?.statusText;
        entry.mimeType = event.response?.mimeType;
      });

      Network.loadingFinished((event: any) => {
        const entry = this.pendingRequests.get(event.requestId);
        if (!entry) return;
        entry.endTime = this.convertTimestamp(event.timestamp);
        this.pushNetworkEntry(entry);
        this.pendingRequests.delete(event.requestId);
      });

      Network.loadingFailed((event: any) => {
        const entry =
          this.pendingRequests.get(event.requestId) ??
          ({
            startTime: this.convertTimestamp(event.timestamp),
          } as ChromeNetworkEntry);
        entry.errorText = event.errorText;
        entry.endTime = this.convertTimestamp(event.timestamp);
        this.pushNetworkEntry(entry);
        this.pendingRequests.delete(event.requestId);
      });
    } catch (error) {
      console.warn("[ChromeDevtoolsMonitor] Unable to connect to Chrome:", error);
      await this.stop();
    }
  }

  async stop(): Promise<ChromeCaptureSnapshot | null> {
    const finishedAt = Date.now();
    if (!this.client || !this.startedAt) {
      this.client = null;
      this.pendingRequests.clear();
      return null;
    }

    try {
      await this.client.close();
    } catch {
      // Ignore close errors
    } finally {
      this.client = null;
    }

    const snapshot: ChromeCaptureSnapshot = {
      consoleLogs: [...this.consoleEntries],
      networkRequests: [...this.networkEntries],
      startedAt: this.startedAt,
      finishedAt,
    };
    this.startedAt = null;
    this.consoleEntries = [];
    this.networkEntries = [];
    this.pendingRequests.clear();
    return snapshot;
  }

  private pushConsoleEntry(entry: ChromeConsoleEntry) {
    this.consoleEntries.push(entry);
    if (this.consoleEntries.length > this.consoleLimit) {
      this.consoleEntries.shift();
    }
  }

  private pushNetworkEntry(entry: ChromeNetworkEntry) {
    this.networkEntries.push(entry);
    if (this.networkEntries.length > this.networkLimit) {
      this.networkEntries.shift();
    }
  }

  private parseDebuggingAddress(browserUrl: string): { hostname: string; port: number } {
    if (!browserUrl) {
      return { hostname: "127.0.0.1", port: 9222 };
    }
    let parsed: URL;
    try {
      parsed = new URL(browserUrl);
    } catch {
      parsed = new URL(`http://${browserUrl}`);
    }
    const port = parsed.port ? Number(parsed.port) : 9222;
    return { hostname: parsed.hostname || "127.0.0.1", port };
  }

  private convertTimestamp(timestamp?: number): number | undefined {
    if (typeof timestamp !== "number") return undefined;
    return timestamp * 1000;
  }

  private stringifyConsoleArg(arg?: { value?: unknown; description?: string; type?: string }): string {
    if (!arg) return "";
    if (typeof arg.value !== "undefined") return String(arg.value);
    if (arg.description) return arg.description;
    return arg.type || "";
  }
}

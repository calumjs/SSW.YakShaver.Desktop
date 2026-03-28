import { config } from "../../config/index.js";
import type { PortalClient, PortalProject } from "../../types/index.js";

/**
 * Client for the SSW.YakShaver portal API.
 * Fetches project and skill data used to determine which MCP servers
 * to connect for a given video processing job.
 */
export class YakShaverPortalClient implements PortalClient {
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor() {
    if (!config.portal.baseUrl) {
      throw new Error(
        "Portal base URL is not configured. Set PORTAL_BASE_URL environment variable.",
      );
    }
    this.baseUrl = config.portal.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.portal.apiKey;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  async getProjects(): Promise<PortalProject[]> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(
        `Portal API error: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as PortalProject[];
  }

  async getProject(id: string): Promise<PortalProject | null> {
    const response = await fetch(`${this.baseUrl}/api/projects/${id}`, {
      headers: this.headers,
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(
        `Portal API error: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as PortalProject;
  }
}

/**
 * Mock portal client for development/testing when the portal API is not available.
 * Returns a configurable set of projects from environment or defaults.
 */
export class MockPortalClient implements PortalClient {
  private projects: PortalProject[];

  constructor(projects?: PortalProject[]) {
    this.projects = projects ?? [
      {
        id: "default",
        name: "Default Project",
        skillDetails: "General purpose project with all available MCP servers",
      },
    ];
  }

  async getProjects(): Promise<PortalProject[]> {
    return this.projects;
  }

  async getProject(id: string): Promise<PortalProject | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }
}

let instance: PortalClient | null = null;

export function getPortalClient(): PortalClient {
  if (instance) return instance;

  if (config.portal.baseUrl) {
    instance = new YakShaverPortalClient();
  } else {
    console.warn(
      "[Portal] No PORTAL_BASE_URL configured. Using mock portal client.",
    );
    instance = new MockPortalClient();
  }

  return instance;
}

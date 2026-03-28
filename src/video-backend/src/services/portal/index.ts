import { config } from "../../config/index.js";
import type { PortalClient, PortalProject } from "../../types/index.js";

/**
 * Client for the SSW.YakShaver portal API.
 *
 * The portal is the source of truth for:
 * - Projects and their skill details
 * - Which MCP servers each project uses (with service-level credentials)
 * - Which users are authorized to use which projects (Layer 3 auth)
 *
 * The MCP server credentials in the portal are SERVICE-LEVEL, not per-user.
 * This is the same model as Claude Code: the MCP server handles its own auth
 * to the backend service. The portal just tells us which servers to connect.
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

  async getProjects(userId?: string): Promise<PortalProject[]> {
    const url = userId
      ? `${this.baseUrl}/api/projects?userId=${encodeURIComponent(userId)}`
      : `${this.baseUrl}/api/projects`;

    const response = await fetch(url, { headers: this.headers });

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

  async isUserAuthorized(
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/projects/${projectId}/authorize/${encodeURIComponent(userId)}`,
        { headers: this.headers },
      );

      if (response.status === 200) return true;
      if (response.status === 403 || response.status === 404) return false;

      // If the portal doesn't implement this endpoint yet, default to allowed
      // (the portal can add fine-grained auth later)
      console.warn(
        `[Portal] Authorization check returned ${response.status} - defaulting to allowed`,
      );
      return true;
    } catch (err) {
      console.warn("[Portal] Authorization check failed:", err);
      // Network error - fail open for now (portal may not implement this yet)
      return true;
    }
  }
}

/**
 * Mock portal client for development/testing when the portal API is not available.
 * All users are authorized for all projects.
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

  async getProjects(_userId?: string): Promise<PortalProject[]> {
    return this.projects;
  }

  async getProject(id: string): Promise<PortalProject | null> {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async isUserAuthorized(
    _userId: string,
    _projectId: string,
  ): Promise<boolean> {
    return true; // Mock: everyone is authorized
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

import type { AgentTool, PortalClient } from "../../../types/index.js";

/**
 * Tool to list available projects from the portal.
 * When a userId is provided, only returns projects the user is authorized for.
 */
export function createListProjectsTool(
  portalClient: PortalClient,
  userId?: string,
): AgentTool {
  return {
    name: "list_projects",
    description:
      "List all available projects from the YakShaver portal. " +
      "Each project has an ID, name, and skill details describing what the project does. " +
      "Use this to find which project a video/transcript relates to.",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute() {
      const projects = await portalClient.getProjects(userId);

      if (projects.length === 0) {
        return "No projects found in the portal.";
      }

      const formatted = projects
        .map(
          (p) =>
            `- Project ID: ${p.id}\n  Name: ${p.name}\n  Skills: ${p.skillDetails || "(none)"}`,
        )
        .join("\n\n");

      return `Found ${projects.length} project(s):\n\n${formatted}`;
    },
  };
}

/**
 * Tool to get detailed information about a specific project.
 */
export function createGetProjectTool(
  portalClient: PortalClient,
): AgentTool {
  return {
    name: "get_project",
    description:
      "Get detailed information about a specific project by ID, " +
      "including its skill details and associated MCP server configurations.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The ID of the project to retrieve",
        },
      },
      required: ["project_id"],
    },
    async execute(args) {
      const projectId = args.project_id as string;
      const project = await portalClient.getProject(projectId);

      if (!project) {
        return `Project '${projectId}' not found.`;
      }

      return JSON.stringify(project, null, 2);
    },
  };
}

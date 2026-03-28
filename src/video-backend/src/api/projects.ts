import { Router } from "express";
import { getPortalClient } from "../services/portal/index.js";

export const projectsRouter = Router();

/**
 * GET /api/projects
 * List all projects from the portal.
 */
projectsRouter.get("/", async (_req, res) => {
  try {
    const portal = getPortalClient();
    const projects = await portal.getProjects();
    res.json(projects);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Projects error:", message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/projects/:id
 * Get a single project from the portal.
 */
projectsRouter.get("/:id", async (req, res) => {
  try {
    const portal = getPortalClient();
    const project = await portal.getProject(req.params.id);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[API] Project error:", message);
    res.status(500).json({ error: message });
  }
});

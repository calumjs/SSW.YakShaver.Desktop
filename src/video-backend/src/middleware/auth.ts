import type { NextFunction, Request, Response } from "express";
import { config } from "../config/index.js";
import type { UserIdentity } from "../types/index.js";

/**
 * Authentication middleware - Layer 1.
 *
 * Verifies the caller is allowed to use YakShaver.
 * This is NOT about permissions to external services (GitHub, Jira, etc.) -
 * those are handled by the MCP servers' own credentials.
 *
 * Supports multiple auth strategies:
 * - API key: Simple, good for service-to-service or internal use
 * - JWT: For integration with an external IdP (Azure AD, Auth0, etc.)
 * - SSO passthrough: For integration with the portal's auth system
 *
 * The authenticated user identity is attached to the request and flows
 * through to the agent, where it's used for ATTRIBUTION (not authorization
 * to external services).
 */

// Extend Express Request to carry user identity
declare global {
  namespace Express {
    interface Request {
      user?: UserIdentity;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: "Authentication required",
      message: "Provide an Authorization header with a Bearer token or API key",
    });
    return;
  }

  // Try API key auth
  if (authHeader.startsWith("ApiKey ")) {
    const apiKey = authHeader.slice(7);
    const identity = validateApiKey(apiKey);
    if (identity) {
      req.user = identity;
      next();
      return;
    }
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // Try Bearer token (JWT)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const identity = validateBearerToken(token);
    if (identity) {
      req.user = identity;
      next();
      return;
    }
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  res.status(401).json({
    error: "Unsupported auth scheme",
    message: "Use 'ApiKey <key>' or 'Bearer <token>'",
  });
}

/**
 * Validate an API key and return the associated user identity.
 *
 * In production, this would look up the key in a database or the portal API.
 * For now, supports a single admin key from environment for bootstrapping.
 */
function validateApiKey(key: string): UserIdentity | null {
  const configuredKey = process.env.YAKSHAVER_API_KEY;
  if (!configuredKey || key !== configuredKey) return null;

  return {
    userId: process.env.YAKSHAVER_API_KEY_USER_ID ?? "service-account",
    displayName:
      process.env.YAKSHAVER_API_KEY_USER_NAME ?? "YakShaver Service",
    authMethod: "api-key",
  };
}

/**
 * Validate a Bearer token (JWT) and extract user identity.
 *
 * In production, this would verify the JWT signature against the IdP's
 * public keys (Azure AD, Auth0, etc.) and extract claims.
 *
 * For now, this is a placeholder that accepts the portal's session tokens.
 */
function validateBearerToken(token: string): UserIdentity | null {
  // TODO: Implement JWT validation against IdP
  // For now, accept portal-issued tokens by calling the portal's
  // token validation endpoint
  const portalBaseUrl = config.portal.baseUrl;
  if (!portalBaseUrl) {
    // No portal configured - reject bearer tokens
    return null;
  }

  // In production: validate JWT or call portal's /api/auth/validate
  // For development: accept any non-empty token with a basic identity
  if (process.env.NODE_ENV === "development" && token.length > 0) {
    return {
      userId: "dev-user",
      displayName: "Development User",
      authMethod: "jwt",
    };
  }

  return null;
}

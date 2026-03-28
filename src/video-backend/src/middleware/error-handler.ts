import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[ErrorHandler]", err.message);

  if (err.message?.includes("Unsupported file type")) {
    res.status(400).json({ error: err.message });
    return;
  }

  if (err.message?.includes("File too large")) {
    res.status(413).json({ error: "File exceeds maximum upload size" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

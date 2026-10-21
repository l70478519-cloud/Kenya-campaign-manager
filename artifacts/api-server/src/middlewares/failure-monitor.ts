import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Records every 5xx API response (and 502/503/504 from provider calls) in
 * kaiti_api_failures, for the Integration Health page. Writes are fire-and-
 * forget so monitoring can never break a request. Query strings and bodies are
 * not stored, so no personal data ends up in the log.
 */
export function failureMonitor(req: Request, res: Response, next: NextFunction): void {
  res.on("finish", () => {
    if (res.statusCode < 500) return;
    const path = (req.originalUrl || req.url).split("?")[0].replace(/^\/api/, "").slice(0, 300);
    const error = typeof res.locals.errorMessage === "string" ? res.locals.errorMessage.slice(0, 500) : null;
    const actor = req.currentUser?.email ?? null;
    db.execute(sql`INSERT INTO public.kaiti_api_failures (method, path, status, error, actor)
      VALUES (${req.method}, ${path}, ${res.statusCode}, ${error}, ${actor})`).catch(() => { /* table may not exist yet */ });
  });
  next();
}

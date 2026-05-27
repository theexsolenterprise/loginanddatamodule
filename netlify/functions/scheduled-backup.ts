/**
 * Twice-daily auto-backup.
 *
 * Runs on Netlify's scheduled-function infrastructure at 00:00 and 12:00 UTC.
 * Creates one auto-backup per client (so a single bad tenant can't break
 * the whole run) plus one system-wide backup.
 *
 * Manual restore points + auto-backups live in the same admin-backups blob
 * store; the listing UI merges them.
 */
import type { Config, Context } from "@netlify/functions";
import { db } from "../../src/db/client";
import { clients } from "../../src/db/schema";
import { createBackup } from "../../src/lib/backup";

export default async (req: Request, context: Context) => {
  const start = Date.now();
  const results: Array<{ scope: string; key?: string; bytes?: number; error?: string }> = [];

  // System-wide first — represents the canonical rollback point.
  try {
    const r = await createBackup({ scope: { kind: "system" }, type: "auto" });
    results.push({ scope: "system", key: r.key, bytes: r.bytes });
  } catch (e) {
    results.push({ scope: "system", error: errMessage(e) });
  }

  // Then per-client, so a single bad client doesn't take down the rest.
  const tenants = await db.select().from(clients);
  for (const c of tenants) {
    try {
      const r = await createBackup({
        scope: { kind: "client", clientId: c.id }, type: "auto",
      });
      results.push({ scope: `client:${c.slug}`, key: r.key, bytes: r.bytes });
    } catch (e) {
      results.push({ scope: `client:${c.slug}`, error: errMessage(e) });
    }
  }

  return Response.json({
    ok: results.every((r) => !r.error),
    elapsedMs: Date.now() - start,
    results,
  });
};

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Twice daily, at midnight and noon UTC.
export const config: Config = {
  schedule: "0 0,12 * * *",
};

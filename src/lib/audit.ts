/**
 * Tiny audit-log helper. Fire-and-forget — if the write fails we log to
 * the server console but don't break the user's action.
 */
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  actorUserId?: string | null;
  clientId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorUserId: entry.actorUserId ?? null,
      clientId: entry.clientId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.warn("[audit] failed to write event", entry.action, e);
  }
}

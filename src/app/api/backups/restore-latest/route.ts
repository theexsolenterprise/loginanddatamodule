import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { listBackups, type BackupScope } from "@/lib/backup";
import { canBackupScope } from "@/lib/backup-rbac";

/**
 * POST /api/backups/restore-latest — looks up the most recent backup in
 * the requested scope and bounces the user to /restore/confirm so they can
 * pick "merge" or "replace" before the destructive action runs.
 *
 * We never restore in one click — restoring is dangerous.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const formData = await req.formData();
  const scope = JSON.parse(String(formData.get("scope") ?? "")) as BackupScope;

  const allowed = await canBackupScope(
    {
      id: session.user.id, role: session.user.role,
      clientId: session.user.clientId, isPrimary: session.user.isPrimary,
    },
    scope,
  );
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const filter =
    scope.kind === "system" ? undefined :
    scope.kind === "client" ? { clientId: scope.clientId } :
    { clientId: scope.clientId, nodeId: scope.nodeId };
  const rows = await listBackups(filter);
  const latest = rows.find((r) => r.type === "manual") ?? rows[0];
  if (!latest) {
    return new Response("No backup found for this scope.", { status: 404 });
  }

  // Redirect to a confirm page that asks merge vs replace.
  const root = session.user.role === "admin" ? "/admin" : "/app";
  const url = new URL(`${root}/settings/restore`, req.url);
  url.searchParams.set("key", latest.key);
  return NextResponse.redirect(url, 303);
}

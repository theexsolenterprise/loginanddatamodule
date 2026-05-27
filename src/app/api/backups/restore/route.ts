import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { restoreBackup, scopeFromKey, type RestoreMode } from "@/lib/backup";
import { canBackupScope } from "@/lib/backup-rbac";
import { logAudit } from "@/lib/audit";

/**
 * Final restore endpoint — only reachable after the user picked merge or
 * replace on /settings/restore.
 *
 * Security:
 *   - Trusted scope is derived from the key path (not the manifest, which
 *     a user-uploaded zip could forge).
 *   - canBackupScope() enforces the same rules as create/upload.
 *   - restoreBackup() additionally refuses to act on any client/node outside
 *     the trusted scope (defence in depth).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const formData = await req.formData();
  const key = String(formData.get("key") ?? "");
  const mode = (String(formData.get("mode") ?? "replace") as RestoreMode);
  if (!["merge", "replace"].includes(mode)) {
    return new Response("invalid mode", { status: 400 });
  }
  if (!key) return new Response("key missing", { status: 400 });

  let scope;
  try {
    scope = scopeFromKey(key);
  } catch {
    return new Response("Invalid backup key", { status: 400 });
  }
  const allowed = await canBackupScope(
    {
      id: session.user.id, role: session.user.role,
      clientId: session.user.clientId, isPrimary: session.user.isPrimary,
    },
    scope,
  );
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const result = await restoreBackup(key, mode);
  await logAudit({
    actorUserId: session.user.id,
    clientId: scope.kind !== "system" ? scope.clientId : null,
    action: "backup.restore",
    target: key,
    metadata: {
      scope, mode,
      clientsTouched: result.clientsTouched,
      usersTouched: result.usersTouched,
      nodesTouched: result.nodesTouched,
    },
  });
  const root = session.user.role === "admin" ? "/admin" : "/app";
  const url = new URL(`${root}/settings`, req.url);
  url.searchParams.set("restored", "ok");
  url.searchParams.set("mode", mode);
  url.searchParams.set("clients", String(result.clientsTouched));
  url.searchParams.set("nodes", String(result.nodesTouched));
  url.searchParams.set("users", String(result.usersTouched));
  return NextResponse.redirect(url, 303);
}

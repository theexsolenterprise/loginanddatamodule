import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { createBackup, type BackupScope } from "@/lib/backup";
import { canBackupScope } from "@/lib/backup-rbac";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const formData = await req.formData();
  const scope = JSON.parse(String(formData.get("scope") ?? "")) as BackupScope;
  const label = String(formData.get("label") ?? "manual");
  const allowed = await canBackupScope(
    {
      id: session.user.id, role: session.user.role,
      clientId: session.user.clientId, isPrimary: session.user.isPrimary,
    },
    scope,
  );
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const result = await createBackup({ scope, type: "manual", label });
  await logAudit({
    actorUserId: session.user.id,
    clientId: scope.kind !== "system" ? scope.clientId : null,
    action: "backup.create",
    target: result.key,
    metadata: { scope, bytes: result.bytes, label },
  });
  // Bounce back to the page that opened us.
  const referer = req.headers.get("referer") ?? "/admin/settings";
  const url = new URL(referer);
  url.searchParams.set("backup", "created");
  url.searchParams.set("key", result.key);
  return NextResponse.redirect(url, 303);
}

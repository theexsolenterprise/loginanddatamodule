import { NextRequest } from "next/server";
import { auth } from "../../../../../auth";
import { downloadBackup, listBackups, type BackupScope } from "@/lib/backup";
import { canBackupScope } from "@/lib/backup-rbac";

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
    // No backup yet → create one on the fly and stream it.
    const { createBackup } = await import("@/lib/backup");
    const r = await createBackup({ scope, type: "manual", label: "ondemand" });
    const data = await downloadBackup(r.key);
    return zipResponse(data!, filenameFor(scope));
  }
  const data = await downloadBackup(latest.key);
  if (!data) return new Response("Backup not found", { status: 404 });
  return zipResponse(data, filenameFor(scope));
}

function zipResponse(data: ArrayBuffer, filename: string) {
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function filenameFor(scope: BackupScope) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (scope.kind === "system") return `quidvis-system-${ts}.zip`;
  if (scope.kind === "client") return `quidvis-client-${scope.clientId.slice(0, 8)}-${ts}.zip`;
  return `quidvis-subtree-${scope.nodeId.slice(0, 8)}-${ts}.zip`;
}

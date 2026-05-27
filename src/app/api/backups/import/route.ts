import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { uploadBackup, type BackupScope } from "@/lib/backup";
import { canBackupScope } from "@/lib/backup-rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const formData = await req.formData();
  const scope = JSON.parse(String(formData.get("scope") ?? "")) as BackupScope;
  const file = formData.get("file");
  if (!(file instanceof File)) return new Response("file missing", { status: 400 });

  const allowed = await canBackupScope(
    {
      id: session.user.id, role: session.user.role,
      clientId: session.user.clientId, isPrimary: session.user.isPrimary,
    },
    scope,
  );
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const label = file.name.replace(/\.zip$/i, "").slice(0, 40) || "import";
  const key = await uploadBackup({ scope, label, data: buffer });

  // Redirect to restore-confirm so the user picks merge vs replace.
  const root = session.user.role === "admin" ? "/admin" : "/app";
  const url = new URL(`${root}/settings/restore`, req.url);
  url.searchParams.set("key", key);
  return NextResponse.redirect(url, 303);
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { restoreBackup, type RestoreMode } from "@/lib/backup";

/**
 * Final restore endpoint — only reachable after the user picked merge or
 * replace on /settings/restore. We re-check the backup's scope vs the
 * actor's permissions by parsing the key.
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

  // Admin can restore anything. Non-admins can only restore subtree keys
  // whose first segment is `clients/<their clientId>/subtree/...`.
  if (session.user.role !== "admin") {
    const expectedPrefix = `clients/${session.user.clientId}/subtree/`;
    if (!key.startsWith(expectedPrefix)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const result = await restoreBackup(key, mode);
  const root = session.user.role === "admin" ? "/admin" : "/app";
  const url = new URL(`${root}/settings`, req.url);
  url.searchParams.set("restored", "ok");
  url.searchParams.set("mode", mode);
  url.searchParams.set("clients", String(result.clientsTouched));
  url.searchParams.set("nodes", String(result.nodesTouched));
  url.searchParams.set("users", String(result.usersTouched));
  return NextResponse.redirect(url, 303);
}

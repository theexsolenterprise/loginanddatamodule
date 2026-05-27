import { auth } from "../../auth";
import { listBackups } from "@/lib/backup";

/**
 * Confirm screen shown before any restore runs.
 * Lets the user choose merge or replace and shows what they're about to do.
 */
export async function RestoreConfirm({ keyParam }: { keyParam: string }) {
  const session = await auth();
  const user = session!.user;

  // Look up metadata for the chosen key by listing the right prefix.
  const filter = user.role === "admin" ? undefined : { clientId: user.clientId ?? undefined };
  const rows = await listBackups(filter);
  const row = rows.find((r) => r.key === keyParam);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Restore from backup</h1>
        <p className="text-sm text-zinc-500">
          Choose how to apply this backup. <strong>Replace</strong> rolls everything
          in scope back to the backup's state and removes anything newer.
          <strong> Merge</strong> only upserts what's in the backup and leaves
          newer rows alone.
        </p>
      </div>

      <dl className="rounded-xl border border-zinc-200 bg-white p-5 text-sm">
        <Term k="Backup key" v={keyParam} mono />
        <Term k="Scope" v={row ? scopeText(row.scope) : "unknown"} />
        <Term k="Type" v={row?.type ?? "—"} />
        <Term k="Created" v={row ? new Date(row.createdAt).toLocaleString() : "—"} />
        {row?.label && <Term k="Label" v={row.label} />}
      </dl>

      <form action="/api/backups/restore" method="post" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <input type="hidden" name="key" value={keyParam} />
        <p className="text-sm font-medium text-amber-900">
          This action cannot be undone. Pick how to apply the backup.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="mode"
            value="merge"
            className="rounded-md border-2 border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            Merge (safe)
          </button>
          <button
            type="submit"
            name="mode"
            value="replace"
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Replace (destructive)
          </button>
        </div>
      </form>
    </div>
  );
}

function scopeText(scope: any): string {
  if (!scope) return "—";
  if (scope.kind === "system") return "System (every client)";
  if (scope.kind === "client") return `Client ${scope.clientId.slice(0, 8)}…`;
  if (scope.kind === "subtree") return `Subtree of node ${scope.nodeId.slice(0, 8)}…`;
  return "—";
}

function Term({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-zinc-100 py-2 last:border-0">
      <dt className="text-zinc-500">{k}</dt>
      <dd className={"col-span-2 " + (mono ? "font-mono text-xs" : "")}>{v}</dd>
    </div>
  );
}

import { listBackups, type BackupScope } from "@/lib/backup";

/**
 * DataBackupCard — the dark card from the reference design.
 *
 * Reused for:
 *   - Admin "system" scope            → /admin/backups
 *   - Admin per-client scope          → /admin/backups?clientId=...
 *   - Store/owner/employee/customer   → /app/backups (subtree of their node)
 *
 * All four buttons hit the same set of endpoints; the `scope` prop is
 * serialized into a hidden input so the server knows what to operate on.
 */
export async function DataBackupCard({
  scope,
  title = "Data Backup",
  description = "Database rows, blobs, structure, and account info.",
}: {
  scope: BackupScope;
  title?: string;
  description?: string;
}) {
  const filter =
    scope.kind === "system" ? undefined :
    scope.kind === "client" ? { clientId: scope.clientId } :
    { clientId: scope.clientId, nodeId: scope.nodeId };
  const rows = await listBackups(filter);
  const latest = rows.find((r) => r.type === "manual") ?? rows[0] ?? null;
  const scopeJson = JSON.stringify(scope);

  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6 text-zinc-100 shadow-lg">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-400">{description}</p>

      <div className="mt-5 space-y-3">
        {/* Create Restore Point — solid green */}
        <form action="/api/backups/create" method="post">
          <input type="hidden" name="scope" value={scopeJson} />
          <input type="hidden" name="label" value="restore-point" />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-lime-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-lime-400"
          >
            <CloudIcon /> Create Restore Point
          </button>
        </form>

        {/* Restore From Latest — outline green */}
        <form action="/api/backups/restore-latest" method="post">
          <input type="hidden" name="scope" value={scopeJson} />
          <button
            type="submit"
            disabled={!latest}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-lime-500 bg-transparent px-4 py-3 text-sm font-semibold text-lime-400 transition hover:bg-lime-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateIcon /> Restore From Latest Restore Point
          </button>
        </form>

        {/* Download Backup — outline orange */}
        <form action="/api/backups/download-latest" method="post">
          <input type="hidden" name="scope" value={scopeJson} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-orange-500 bg-transparent px-4 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500/10"
          >
            <DownloadIcon /> Download Backup
          </button>
        </form>

        {/* Import Backup — outline gray, multipart */}
        <form
          action="/api/backups/import"
          method="post"
          encType="multipart/form-data"
          className="relative"
        >
          <input type="hidden" name="scope" value={scopeJson} />
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-zinc-600 bg-transparent px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800">
            <UploadIcon /> Import Backup (.json or .zip)
            <input
              type="file"
              name="file"
              accept=".zip,.json,application/zip,application/json"
              className="absolute inset-0 cursor-pointer opacity-0"
              required
              onChange={undefined}
            />
          </label>
        </form>
      </div>

      {/* Footer: latest timestamp */}
      <div className="mt-5 flex items-center gap-2 text-xs text-zinc-400">
        <ClockIcon />
        Latest restore point:{" "}
        <span className="text-zinc-200">
          {latest ? formatDate(latest.createdAt) : "—"}
        </span>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
  );
}

/* ─── Tiny inline icons (no external deps) ─────────────────────────────── */
function CloudIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 18a4.5 4.5 0 0 0 0-9h-.65a7 7 0 0 0-13.7 1.5A4.5 4.5 0 0 0 5 18z" />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

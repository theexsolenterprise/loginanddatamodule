"use client";

import { useRef, useState, useTransition } from "react";

/**
 * Client-side wrapper for the "Import Backup" button.
 * Picking a file auto-submits the form so the UX matches the reference
 * (one click → choose file → upload starts).
 */
export function ImportBackupButton({ scopeJson }: { scopeJson: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        const res = await fetch("/api/backups/import", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
        // Reload so the latest-restore-point label refreshes.
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        encType="multipart/form-data"
        className="relative"
        onSubmit={(e) => e.preventDefault()}
      >
        <input type="hidden" name="scope" value={scopeJson} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".zip,.json,application/zip,application/json"
          className="hidden"
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-zinc-600 bg-transparent px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? (
            "Uploading…"
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Import Backup (.json or .zip)
            </>
          )}
        </button>
      </form>
      {error && (
        <p className="mt-2 rounded border border-red-700 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </>
  );
}

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db/client";
import { clients, users, nodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { ClientLabels, ClientStructure } from "@/types/client-structure";
import { requireAdmin } from "../../../../../auth";
import { logAudit } from "@/lib/audit";

export default async function ClientDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) notFound();

  const labels = (c.labels ?? {}) as ClientLabels;
  const structure = (c.structure ?? {}) as ClientStructure;
  const userRows = await db.select().from(users).where(eq(users.clientId, c.id));
  const nodeRows = await db.select().from(nodes).where(eq(nodes.clientId, c.id));

  async function deleteClient() {
    "use server";
    const session = await requireAdmin();
    await db.delete(clients).where(eq(clients.id, id));
    await logAudit({
      actorUserId: session.user.id, clientId: id,
      action: "client.delete", target: c.slug,
    });
    redirect("/admin/clients");
  }

  async function suspendClient() {
    "use server";
    const session = await requireAdmin();
    await db.update(clients).set({ status: "suspended" }).where(eq(clients.id, id));
    await logAudit({
      actorUserId: session.user.id, clientId: id,
      action: "client.suspend", target: c.slug,
    });
  }

  async function activateClient() {
    "use server";
    const session = await requireAdmin();
    await db.update(clients).set({ status: "active" }).where(eq(clients.id, id));
    await logAudit({
      actorUserId: session.user.id, clientId: id,
      action: "client.activate", target: c.slug,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/admin/clients" className="text-xs text-zinc-500 hover:underline">
            ← All clients
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">{c.name}</h1>
          <p className="text-xs text-zinc-500">{c.kind} · {c.slug} · {c.status}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/clients/${c.id}/edit`}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs text-white hover:bg-zinc-800"
          >
            Edit structure
          </Link>
          <Link
            href={`/admin/settings/backup`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
          >
            Backups
          </Link>
          {c.status === "active" ? (
            <form action={suspendClient}>
              <button className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 hover:bg-amber-100">
                Suspend
              </button>
            </form>
          ) : (
            <form action={activateClient}>
              <button className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 hover:bg-emerald-100">
                Activate
              </button>
            </form>
          )}
          <form action={deleteClient}>
            <button className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 hover:bg-red-100">
              Delete
            </button>
          </form>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Labels</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Term k="Store" v={labels.store} />
            <Term k="Owner" v={labels.owner} />
            <Term k="Employee" v={labels.employee} />
            <Term k="Customer" v={labels.customer} />
            <Term k="Primary employee" v={labels.employeePrimary} />
            <Term k="Secondary employee" v={labels.employeeSecondary} />
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Structure</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Term k="Link policy" v={structure.linkPolicy ?? "—"} />
            <Term k="Primary/Secondary?" v={structure.employeeTiers ? "yes" : "no"} />
          </dl>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Tiers ({structure.tiers?.length ?? 0})
          </h3>
          <ul className="mt-2 space-y-1 text-xs">
            {(structure.tiers ?? []).map((t) => (
              <li key={t.key} className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5">
                <span>
                  <span className="font-medium text-zinc-800">{t.label}</span>{" "}
                  <span className="font-mono text-[10px] text-zinc-500">/{t.key}</span>
                </span>
                <span className="text-zinc-600">
                  {t.bucketing === "combined"
                    ? `combined · ${t.subBuckets == null ? "∞" : t.subBuckets} sub`
                    : "separate"} · {t.cap == null ? "∞" : t.cap}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Users" value={userRows.length} />
        <Stat label="Tree nodes" value={nodeRows.length} />
        <Stat label="Blobs store" value={c.blobsStore} mono />
      </section>
    </div>
  );
}

function cap(v: number | null | undefined) {
  return v == null ? "Unlimited" : String(v);
}

function Term({ k, v }: { k: string; v?: string | null }) {
  return (
    <>
      <dt className="text-zinc-500">{k}</dt>
      <dd className="font-medium text-zinc-900">{v ?? "—"}</dd>
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={"mt-1 text-base font-semibold text-zinc-900 " + (mono ? "font-mono text-xs" : "")}>
        {value}
      </div>
    </div>
  );
}

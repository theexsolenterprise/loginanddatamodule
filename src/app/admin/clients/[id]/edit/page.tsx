import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  TierSchema,
  ClientLabelsSchema,
  ClientStructureSchema,
  defaultLabels,
  type ClientLabels,
  type ClientStructure,
} from "@/types/client-structure";
import { DynamicTierEditorHydrated } from "@/components/DynamicTierEditorHydrated";
import { ensurePrefix, getClientStore, storeNameForClient } from "@/lib/blobs";
import { defaultFolderPlan } from "@/lib/structure";
import { requireAdmin } from "../../../../../../auth";

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) notFound();

  const labels = (c.labels ?? defaultLabels()) as ClientLabels;
  const structure = (c.structure ?? {}) as ClientStructure;

  async function save(formData: FormData) {
    "use server";
    await requireAdmin();
    const name = String(formData.get("name") ?? c.name).trim();
    const kind = String(formData.get("kind") ?? c.kind);

    const nextLabels = ClientLabelsSchema.parse({
      store: String(formData.get("label_store") || labels.store),
      owner: String(formData.get("label_owner") || labels.owner),
      employee: String(formData.get("label_employee") || labels.employee),
      customer: String(formData.get("label_customer") || labels.customer),
      employeePrimary: String(formData.get("label_employeePrimary") || labels.employeePrimary),
      employeeSecondary: String(formData.get("label_employeeSecondary") || labels.employeeSecondary),
    });

    const tiersRaw = String(formData.get("tiers_json") ?? "[]");
    let tiers;
    try {
      tiers = z.array(TierSchema).parse(JSON.parse(tiersRaw));
    } catch {
      throw new Error("Invalid tiers configuration.");
    }
    if (tiers.length === 0) throw new Error("Define at least one tier.");

    const keys = new Set<string>();
    for (const t of tiers) {
      if (keys.has(t.key)) throw new Error(`Duplicate tier key: ${t.key}`);
      keys.add(t.key);
    }

    const nextStructure = ClientStructureSchema.parse({
      tiers,
      linkPolicy: String(formData.get("linkPolicy") ?? structure.linkPolicy ?? "flexible") as "strict" | "flexible",
      employeeTiers: formData.get("employeeTiers") === "on",
    });
    nextStructure.roles = Array.from(new Set(tiers.map((t) => t.roleAs)));

    await db.update(clients).set({
      name, kind, labels: nextLabels, structure: nextStructure, updatedAt: new Date(),
    }).where(eq(clients.id, c.id));

    // Reflect the new tier shape on disk: ensure any new top-level prefixes
    // exist. We don't delete old prefixes — that would lose data. Operators
    // who actually want to drop a removed tier's folder can do it manually
    // (or via a future migration tool).
    const storeName = c.blobsStore || storeNameForClient(c.id);
    const store = getClientStore(storeName);
    await store.set("_meta/manifest.json", JSON.stringify({
      clientId: c.id, provisionedAt: c.createdAt, updatedAt: new Date().toISOString(),
      structure: nextStructure,
    }, null, 2));
    for (const prefix of defaultFolderPlan(nextStructure)) {
      await ensurePrefix(store, prefix);
    }

    redirect(`/admin/clients/${c.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${c.id}`} className="text-xs text-zinc-500 hover:underline">
          ← Back to {c.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">Edit structure</h1>
        <p className="text-sm text-zinc-500">Reshape this tenant's tiers, labels, and bucketing. Existing data is preserved; new tier prefixes are added on save.</p>
      </div>

      <form action={save} className="space-y-8 rounded-xl border border-zinc-200 bg-white p-6">
        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Identity</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Display name</span>
              <input name="name" defaultValue={c.name} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Kind</span>
              <input name="kind" defaultValue={c.kind} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Tier labels</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["store", "owner", "employee", "customer", "employeePrimary", "employeeSecondary"] as const).map((k) => (
              <label className="block" key={k}>
                <span className="text-xs font-medium text-zinc-700">{labelTitle(k)}</span>
                <input
                  name={`label_${k}`}
                  defaultValue={labels[k]}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Tiers</h2>
          <div className="mt-3">
            <DynamicTierEditorHydrated initial={structure.tiers ?? []} />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900">Tree policy</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-zinc-700">Link policy</span>
              <select name="linkPolicy" defaultValue={structure.linkPolicy ?? "flexible"} className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="flexible">Flexible — children can hang off any ancestor</option>
                <option value="strict">Strict — every child must have a parent in the tier above</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="employeeTiers" defaultChecked={structure.employeeTiers ?? true} />
              Use primary / secondary employee tiers
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-2">
          <Link href={`/admin/clients/${c.id}`} className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </Link>
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800">
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function labelTitle(k: string) {
  switch (k) {
    case "store": return "Store";
    case "owner": return "Owner";
    case "employee": return "Employee";
    case "customer": return "Customer";
    case "employeePrimary": return "Primary employee";
    case "employeeSecondary": return "Secondary employee";
    default: return k;
  }
}

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import {
  ClientStructureSchema,
  defaultLabels,
  defaultStructure,
} from "@/types/client-structure";
import { provisionClientStore } from "@/lib/structure";
import { storeNameForClient } from "@/lib/blobs";
import { OrgGraphCanvas } from "@/components/OrgGraphCanvas";
import { GraphNodeSchema, GraphEdgeSchema, tiersFromGraph } from "@/types/client-structure";
import { z } from "zod";
import { requireAdmin } from "../../../../../auth";
import { logAudit } from "@/lib/audit";

// Free-text suggestions for the Kind field. The user can type anything.
const KIND_SUGGESTIONS = [
  "E-commerce store",
  "Healthcare / clinic",
  "Education / school",
  "Professional services",
  "Restaurant chain",
  "Real estate",
  "Logistics",
  "Salon / spa",
  "Custom",
];

export default function NewClientPage() {
  async function create(formData: FormData) {
    "use server";
    const session = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const slugVal = slug(String(formData.get("slug") ?? name));
    const kind = String(formData.get("kind") ?? "custom");

    // Labels — defaults retained for compatibility; box labels are the source of truth.
    const labels = defaultLabels();

    // Graph (nodes + edges) comes from the OrgGraphCanvas client component.
    const graphRaw = String(formData.get("graph_json") ?? "{}");
    let graph;
    try {
      graph = z.object({
        nodes: z.array(GraphNodeSchema),
        edges: z.array(GraphEdgeSchema),
      }).parse(JSON.parse(graphRaw));
    } catch {
      throw new Error("Invalid graph configuration.");
    }
    if (graph.nodes.length === 0) throw new Error("Add at least one box to the chart.");

    // Derive legacy `tiers[]` from the graph for backward compat with the
    // folder provisioner.
    const tiers = tiersFromGraph(graph);

    const structure = ClientStructureSchema.parse({
      graph,
      tiers,
      linkPolicy: String(formData.get("linkPolicy") ?? "flexible") as "strict" | "flexible",
      employeeTiers: formData.get("employeeTiers") === "on",
    });
    structure.roles = Array.from(new Set(tiers.map((t) => t.roleAs)));

    // Insert client, then provision Blobs store, then update the row with the
    // store name. We do this in two steps so the blobs store name is
    // derivable from the client id.
    const [row] = await db
      .insert(clients)
      .values({
        name,
        slug: slugVal,
        kind,
        labels,
        structure,
        blobsStore: "", // filled below
      })
      .returning();

    const storeName = await provisionClientStore({ clientId: row.id, structure });
    await db
      .update(clients)
      .set({ blobsStore: storeName })
      .where(_clientIdEq(row.id));

    await logAudit({
      actorUserId: session.user.id,
      clientId: row.id,
      action: "client.create",
      target: row.slug,
      metadata: { kind, tiers: tiers.map((t) => t.key) },
    });

    redirect(`/admin/clients/${row.id}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Onboard a client</h1>
      <p className="text-sm text-zinc-500">
        Give the tenant an identity and build their company chart. Each box is a position;
        click <span className="font-mono">+ child</span> for a level below or <span className="font-mono">+ sibling</span> for a parallel branch.
      </p>

      <form action={create} className="space-y-8 rounded-xl border border-zinc-200 bg-white p-6">
        {/* ── Identity ── */}
        <Section title="Identity">
          <Row>
            <Field name="name" label="Display name" placeholder="Acme Co." required />
            <Field name="slug" label="URL slug" placeholder="acme" />
          </Row>
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Kind</span>
            <input
              name="kind"
              list="kind-suggestions"
              placeholder="Pick a suggestion or type your own"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <datalist id="kind-suggestions">
              {KIND_SUGGESTIONS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </label>
        </Section>

        {/* ── Free-placement org-chart canvas ── */}
        <Section title="Company structure">
          <p className="-mt-2 mb-4 text-xs text-zinc-500">
            Drag boxes anywhere. Drag from a box's bottom handle to another box's top handle to draw a connection
            (many-to-one supported). Add a box with the toolbar; pick its level (1 = closest to admin).
          </p>
          <OrgGraphCanvas />
        </Section>

        {/* ── Policy ── */}
        <Section title="Tree policy">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Link policy</span>
            <select
              name="linkPolicy"
              defaultValue="flexible"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="flexible">Flexible — children can hang off any ancestor</option>
              <option value="strict">Strict — every child must have a parent in the tier above (e.g. patients must link to doctors)</option>
            </select>
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="employeeTiers" defaultChecked />
            <span>Use primary / secondary employee tiers</span>
          </label>
        </Section>

        <div className="flex justify-end gap-2 pt-2">
          <a href="/admin/clients" className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </a>
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800">
            Create client
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  name, label, placeholder, required, defaultValue,
}: { name: string; label: string; placeholder?: string; required?: boolean; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Tiny local helper to keep this file's imports tidy.
import { eq } from "drizzle-orm";
import { clients as _clients } from "@/db/schema";
function _clientIdEq(id: string) { return eq(_clients.id, id); }

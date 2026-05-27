import { SettingsTabs } from "@/components/SettingsTabs";
import { DataBackupCard } from "@/components/DataBackupCard";
import { auth } from "../../../../../auth";
import { db } from "@/db/client";
import { nodes } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function AppBackupTabPage() {
  const session = await auth();
  const me = session!.user;
  const [myNode] = me.clientId
    ? await db.select().from(nodes).where(eq(nodes.userId, me.id)).limit(1)
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/app/settings" active="backup" />

      {myNode && me.clientId ? (
        <DataBackupCard
          scope={{ kind: "subtree", clientId: me.clientId, nodeId: myNode.id }}
          title="My data backup"
          description="Your account, the people you manage, and everything filed under your branch."
        />
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
          No backup scope: your user isn't linked to a tree node yet. Ask your administrator to assign you a position in the structure.
        </p>
      )}
    </div>
  );
}

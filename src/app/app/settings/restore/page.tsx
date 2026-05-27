import { RestoreConfirm } from "@/components/RestoreConfirm";

export default async function AppRestorePage(
  props: { searchParams: Promise<{ key?: string }> },
) {
  const { key } = await props.searchParams;
  if (!key) return <p className="text-sm text-zinc-500">No backup key supplied.</p>;
  return <RestoreConfirm keyParam={key} />;
}

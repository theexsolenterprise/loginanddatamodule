import { SettingsForm } from "@/components/SettingsForm";
import { SettingsTabs } from "@/components/SettingsTabs";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
      <SettingsTabs base="/admin/settings" active="account" />
      <SettingsForm />
    </div>
  );
}

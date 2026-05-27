import { Shell } from "@/components/Shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Shell handles role checks via the session; middleware already gated /admin.
  return <Shell>{children}</Shell>;
}

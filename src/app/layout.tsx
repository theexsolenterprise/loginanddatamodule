import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quidvis — Login & Data Module",
  description: "Multi-tenant role-based login and data hub",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

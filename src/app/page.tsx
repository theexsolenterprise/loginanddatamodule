import { redirect } from "next/navigation";
import { auth } from "../../auth";

/**
 * Landing page: if you're signed in, jump to the dashboard for your role;
 * otherwise send to /login.
 */
export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(session.user.role === "admin" ? "/admin" : "/app");
}

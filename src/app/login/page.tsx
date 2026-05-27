import { signIn } from "../../../auth";
import { redirect } from "next/navigation";

interface SearchParams {
  next?: string;
  error?: string;
}

/**
 * Universal login page. Same UI for every role — the server figures out who
 * you are from the email+password match (or the linked Google account) and
 * redirects you to the right dashboard via `middleware.ts` + `/page.tsx`.
 */
export default async function LoginPage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const next = sp.next ?? "/";

  async function credentialsLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      await signIn("credentials", { email, password, redirectTo: next });
    } catch (e) {
      // Auth.js throws redirects internally; only real errors should bubble.
      if ((e as any)?.digest?.startsWith("NEXT_REDIRECT")) throw e;
      redirect(`/login?error=invalid_credentials&next=${encodeURIComponent(next)}`);
    }
  }

  async function googleLogin() {
    "use server";
    await signIn("google", { redirectTo: next });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Use your work email or your Google account.
        </p>

        {sp.error && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {sp.error === "invalid_credentials"
              ? "That email and password don't match."
              : sp.error}
          </p>
        )}

        <form action={credentialsLogin} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign in
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200" /> or <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form action={googleLogin}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Don't have an account? Ask your administrator to invite you.
        </p>
      </div>
    </div>
  );
}

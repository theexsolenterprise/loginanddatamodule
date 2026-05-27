import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, accounts, sessions, verificationTokens, type Role } from "@/db/schema";

/* ────────────────────────────────────────────────────────────────────────────
 * Module augmentation: attach our custom session fields so callers get
 * `session.user.role` / `session.user.clientId` / `session.user.isPrimary`
 * with full TypeScript types — no `as any` casts.
 * ──────────────────────────────────────────────────────────────────────────── */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      clientId: string | null;
      isPrimary: boolean;
      firstName: string;
      lastName: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    clientId: string | null;
    isPrimary: boolean;
    firstName: string;
    lastName: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" }, // JWT lets middleware read the role without a DB hit.
  trustHost: true,

  providers: [
    /**
     * Credentials provider — email + password against our `users` table.
     * Returns the user record so JWT can pick up the role/clientId.
     */
    Credentials({
      name: "Email & password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const matches = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(5);

        // Multiple users can share an email across clients; pick the first
        // active one whose password matches. (Admin is matched first because
        // its clientId is NULL — we sort that to the top.)
        const candidates = matches
          .filter((u) => !u.disabledAt && u.passwordHash)
          .sort((a, b) => Number(b.clientId === null) - Number(a.clientId === null));

        for (const u of candidates) {
          const ok = await bcrypt.compare(password, u.passwordHash!);
          if (ok) {
            return {
              id: u.id,
              email: u.email,
              name: `${u.firstName} ${u.lastName}`.trim(),
              image: u.image ?? undefined,
            };
          }
        }
        return null;
      },
    }),

    /**
     * Google OAuth. `allowDangerousEmailAccountLinking` lets a user who first
     * signed up with email/password later log in with Google using the same
     * email and have the two providers linked instead of getting an
     * OAuthAccountNotLinked error. Safe here because we control the
     * Credentials provider too — both are anchored to the same `users.email`.
     */
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    /**
     * Hydrate JWT with our app-specific claims the first time a user signs in
     * (when `user` is set), and refresh them on every subsequent request so a
     * role change takes effect without forcing a logout.
     */
    async jwt({ token, user }) {
      const userId = (user?.id ?? (token as any).uid) as string | undefined;
      if (!userId) return token;

      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row) return token;

      (token as any).uid = row.id;
      (token as any).role = row.role;
      (token as any).clientId = row.clientId;
      (token as any).isPrimary = row.isPrimary;
      (token as any).firstName = row.firstName;
      (token as any).lastName = row.lastName;
      return token;
    },

    async session({ session, token }) {
      const t = token as any;
      if (t.uid) {
        session.user.id = t.uid;
        session.user.role = t.role;
        session.user.clientId = t.clientId;
        session.user.isPrimary = t.isPrimary;
        session.user.firstName = t.firstName;
        session.user.lastName = t.lastName;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});

/**
 * Helper for server actions / API routes: returns the session or throws a 401.
 * Saves writing `if (!session) return new Response(…401…)` in every handler.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

/** Admin-only guard for cross-tenant operations (client CRUD, etc.). */
export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return session;
}

/** Helper for finding the bootstrap admin record. */
export async function findAdminByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase()), isNull(users.clientId)))
    .limit(1);
  return row ?? null;
}

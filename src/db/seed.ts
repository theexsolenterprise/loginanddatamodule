/**
 * Seed: creates the bootstrap admin (you) so you can log in immediately
 * after wiring up Neon. Idempotent — re-running just ensures the admin
 * exists with the configured email/password.
 *
 * Usage:  npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "./client";
import { users } from "./schema";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME ?? "Admin";
  const lastName = process.env.ADMIN_LAST_NAME ?? "User";

  if (!email || !password) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.",
    );
  }

  const existing = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.clientId)))
    .limit(1);

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing[0]) {
    await db
      .update(users)
      .set({ passwordHash, firstName, lastName, role: "admin" })
      .where(eq(users.id, existing[0].id));
    console.log(`✓ admin updated: ${email}`);
  } else {
    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName,
        lastName,
        role: "admin",
        clientId: null,
      })
      .returning();
    console.log(`✓ admin created: ${row.email} (id=${row.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

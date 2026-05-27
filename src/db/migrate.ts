/**
 * One-shot migration runner: applies any pending drizzle migrations against
 * the configured Neon database.
 *
 * Usage:  npm run db:migrate
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

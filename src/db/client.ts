import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's serverless driver pipelines multiple statements over HTTP.
neonConfig.fetchConnectionCache = true;

const url = process.env.DATABASE_URL;
if (!url) {
  // Fail loudly — but only at the moment the DB is actually used, not at import.
  // (Build-time pages that don't touch the DB shouldn't crash.)
  console.warn("[db] DATABASE_URL is not set. DB calls will throw at runtime.");
}

export const sql = url ? neon(url) : (null as unknown as ReturnType<typeof neon>);
export const db = drizzle(sql, { schema });
export { schema };

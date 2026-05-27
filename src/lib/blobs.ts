import { getStore, type Store } from "@netlify/blobs";
import { mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

/**
 * Netlify Blobs has two modes:
 *
 *   1. ON Netlify   — `getStore("name")` works with no creds; the platform
 *                     injects siteID + token via environment headers.
 *   2. Local dev    — needs explicit { name, siteID, token } if you want to
 *                     hit the real Blobs service. Most devs don't.
 *
 * We add a third mode: a *local on-disk fallback* under `./.blobs/<store>/`,
 * activated when neither Netlify env nor explicit creds are present. This
 * lets the app work offline against a local filesystem, then swap to real
 * Blobs in prod with zero code change.
 */

const localRoot = ".blobs";

function isNetlifyRuntime() {
  return Boolean(process.env.NETLIFY) || Boolean(process.env.NETLIFY_DEV);
}

function hasExplicitCreds() {
  return Boolean(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN);
}

interface BlobLike {
  set(key: string, data: string | Uint8Array | ArrayBuffer): Promise<void>;
  get(key: string, opts?: { type: "stream" | "arrayBuffer" | "text" }): Promise<any>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ blobs: { key: string }[] }>;
}

/* ── On-disk fallback that matches the Blobs surface area we use ──────────── */

function makeLocalStore(name: string): BlobLike {
  const base = join(process.cwd(), localRoot, name);
  return {
    async set(key, data) {
      const file = join(base, key);
      await mkdir(dirname(file), { recursive: true });
      const buf =
        typeof data === "string"
          ? Buffer.from(data, "utf8")
          : data instanceof ArrayBuffer
            ? Buffer.from(new Uint8Array(data))
            : Buffer.from(data);
      await writeFile(file, buf);
    },
    async get(key, opts) {
      const file = join(base, key);
      try {
        const buf = await readFile(file);
        if (opts?.type === "text") return buf.toString("utf8");
        if (opts?.type === "arrayBuffer") return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        return buf; // default to buffer
      } catch (e: any) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async delete(key) {
      try {
        await rm(join(base, key));
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
    },
    async list(opts) {
      const prefix = opts?.prefix ?? "";
      const out: { key: string }[] = [];
      async function walk(dir: string, rel: string) {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (e: any) {
          if (e.code === "ENOENT") return;
          throw e;
        }
        for (const ent of entries) {
          const child = join(dir, ent.name);
          const relChild = rel ? `${rel}/${ent.name}` : ent.name;
          if (ent.isDirectory()) await walk(child, relChild);
          else if (relChild.startsWith(prefix)) out.push({ key: relChild });
        }
      }
      await walk(base, "");
      return { blobs: out };
    },
  };
}

/**
 * Get a Blobs store. Prefer the real Netlify service whenever creds exist;
 * fall back to disk so dev-without-Netlify still works.
 */
export function getClientStore(storeName: string): BlobLike {
  if (isNetlifyRuntime() || hasExplicitCreds()) {
    return getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_AUTH_TOKEN,
    }) as unknown as BlobLike;
  }
  return makeLocalStore(storeName);
}

export function storeNameForClient(clientId: string) {
  return `client-${clientId}`;
}

/**
 * Write a `.placeholder` blob inside a key prefix so the folder exists in
 * listings before any real data is uploaded. Blobs have no directories, so
 * this is the conventional way to "create a folder".
 */
export async function ensurePrefix(store: BlobLike, prefix: string) {
  const key = prefix.endsWith("/") ? `${prefix}.placeholder` : `${prefix}/.placeholder`;
  await store.set(key, "");
}

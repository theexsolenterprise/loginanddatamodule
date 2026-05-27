/**
 * Stream a Netlify Blobs store's contents into a zip — used by the admin
 * "Download backup" button on each client's page.
 *
 * Returns a Web ReadableStream so the route handler can pipe it directly to
 * the HTTP response without buffering the whole archive in memory.
 */

import archiver from "archiver";
import { getClientStore } from "@/lib/blobs";
import { Readable } from "node:stream";

export function streamClientBackup(storeName: string): ReadableStream {
  const store = getClientStore(storeName);
  const archive = archiver("zip", { zlib: { level: 9 } });

  // Pull contents into the archive asynchronously.
  (async () => {
    try {
      const { blobs } = await store.list();
      for (const { key } of blobs) {
        if (key.endsWith(".placeholder")) continue;
        const data = await store.get(key, { type: "arrayBuffer" });
        if (!data) continue;
        archive.append(Buffer.from(data), { name: key });
      }
      await archive.finalize();
    } catch (e) {
      archive.abort();
      console.error("[zip] backup failed", e);
    }
  })();

  // Bridge Node Readable → Web ReadableStream so we can return it from Next.
  return Readable.toWeb(archive) as unknown as ReadableStream;
}

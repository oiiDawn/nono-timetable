/** Run persistence tests against an isolated, in-memory D1 runtime. */
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

export async function testDatabase() {
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: "test",
          compatibilityDate: "2026-10-06",
          manifest: {
            mainModule: "index.js",
            modules: {
              "index.js": {
                type: "esm",
                contents: "export default { fetch() { return new Response('test'); } }",
              },
            },
          },
          env: { DB: { type: "d1", id: "test-db" } },
        },
      },
    ],
  });
  const db = await runtime.getD1Database("DB");
  const schema = await readFile(new URL("../migrations/0001_schema.sql", import.meta.url), "utf8");
  await db.batch(
    schema
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s)),
  );
  return { db, dispose: () => runtime.dispose() };
}

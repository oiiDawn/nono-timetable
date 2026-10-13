/** Keep each request's D1 binding isolated across concurrent Pages requests. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { D1Database } from "@cloudflare/workers-types";

const binding = new AsyncLocalStorage<D1Database>();
export const withDatabase = <T>(db: D1Database, run: () => T): T => binding.run(db, run);

export function database(): D1Database {
  const db = binding.getStore();
  if (!db) throw new Error("Missing D1 DB binding");
  return db;
}

/** Persist OAuth grants and atomically consume codes or rotate refresh credentials. */
import { sql } from "./db.js";

let schema: Promise<unknown> | undefined;
export function ensureOAuthSchema() {
  const db = sql();
  schema ??= db
    .transaction(
      `
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY, metadata JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS oauth_requests (
      id TEXT PRIMARY KEY, data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_grants (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients(id),
      redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, resource TEXT NOT NULL,
      revoked BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
      kind TEXT NOT NULL CHECK (kind IN ('code','access','refresh')),
      used BOOLEAN NOT NULL DEFAULT false, expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS oauth_tokens_grant ON oauth_tokens(grant_id);
  `
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => db.query(statement)),
    )
    .catch((error: unknown) => {
      schema = undefined;
      throw error;
    });
  return schema;
}

export interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  state: string;
}

export async function getAuthorizationRequest(id: string): Promise<AuthorizationRequest | null> {
  await ensureOAuthSchema();
  const rows = await sql().query(
    "SELECT data FROM oauth_requests WHERE id = $1 AND expires_at > now()",
    [id],
  );
  return rows[0]?.data ?? null;
}

export async function approveAuthorization(id: string, grantId: string, codeHash: string) {
  const rows = await sql().query(
    `
    WITH request AS (
      DELETE FROM oauth_requests WHERE id = $1 AND expires_at > now() RETURNING data
    ), grant_row AS (
      INSERT INTO oauth_grants (id, client_id, redirect_uri, challenge, resource)
      SELECT $2, data->>'clientId', data->>'redirectUri', data->>'challenge', data->>'resource'
      FROM request RETURNING id
    )
    INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at)
    SELECT $3, id, 'code', now() + interval '5 minutes' FROM grant_row RETURNING grant_id
  `,
    [id, grantId, codeHash],
  );
  return rows.length === 1;
}

/** Lock the grant before consuming a credential; replay revokes the entire token family. */
export async function exchangeCredential(input: {
  hash: string;
  kind: "code" | "refresh";
  clientId: string;
  resource: string;
  redirectUri: string;
  challenge: string;
  accessHash: string;
  refreshHash: string;
}): Promise<boolean> {
  await ensureOAuthSchema();
  const rows = await sql().query(
    `
    WITH locked AS MATERIALIZED (
      SELECT g.id FROM oauth_grants g JOIN oauth_tokens t ON t.grant_id = g.id
      WHERE t.hash = $1 AND t.kind = $2 AND (t.expires_at IS NULL OR t.expires_at > now())
        AND g.client_id = $3 AND g.resource = $4 AND NOT g.revoked
        AND ($2 = 'refresh' OR (g.redirect_uri = $5 AND g.challenge = $6))
      FOR UPDATE OF g
    ), consumed AS (
      UPDATE oauth_tokens t SET used = true FROM locked
      WHERE t.hash = $1 AND t.grant_id = locked.id AND NOT t.used RETURNING t.grant_id
    ), revoked AS (
      UPDATE oauth_grants SET revoked = true WHERE id IN (SELECT id FROM locked)
      AND NOT EXISTS (SELECT 1 FROM consumed)
    ), issued AS (
      INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at)
      SELECT $7, grant_id, 'access', now() + interval '1 hour' FROM consumed
      UNION ALL SELECT $8, grant_id, 'refresh', NULL FROM consumed RETURNING hash
    ) SELECT hash FROM issued
  `,
    [
      input.hash,
      input.kind,
      input.clientId,
      input.resource,
      input.redirectUri,
      input.challenge,
      input.accessHash,
      input.refreshHash,
    ],
  );
  return rows.length === 2;
}

export async function accessGrant(hash: string, resource: string): Promise<string | null> {
  await ensureOAuthSchema();
  const rows = await sql().query(
    `SELECT g.id FROM oauth_grants g JOIN oauth_tokens t ON t.grant_id = g.id
    WHERE t.hash = $1 AND t.kind = 'access' AND t.expires_at > now()
      AND NOT g.revoked AND g.resource = $2`,
    [hash, resource],
  );
  return rows[0]?.id ?? null;
}

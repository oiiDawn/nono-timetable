/** Persist OAuth grants and consume credentials atomically with D1 batches. */
import { database } from "./database.js";

export interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  state: string;
}

export async function getAuthorizationRequest(id: string): Promise<AuthorizationRequest | null> {
  const row = await database()
    .prepare(
      "SELECT data FROM oauth_requests WHERE id = ? AND julianday(expires_at) > julianday('now')",
    )
    .bind(id)
    .first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}

export async function approveAuthorization(id: string, grantId: string, codeHash: string) {
  const db = database();
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO oauth_grants (id, client_id, redirect_uri, challenge, resource)
      SELECT ?, data->>'$.clientId', data->>'$.redirectUri', data->>'$.challenge', data->>'$.resource'
      FROM oauth_requests WHERE id = ? AND julianday(expires_at) > julianday('now')`,
      )
      .bind(grantId, id),
    db
      .prepare(
        `INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at)
      SELECT ?, ?, 'code', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes') WHERE changes() = 1`,
      )
      .bind(codeHash, grantId),
    db.prepare("DELETE FROM oauth_requests WHERE id = ? AND changes() = 1").bind(id),
  ]);
  return result[0].meta.changes === 1;
}

/** Replay revokes the family before issuance; serialized batches allow only one consumer. */
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
  const db = database();
  const matching = `SELECT g.id FROM oauth_grants g JOIN oauth_tokens t ON t.grant_id = g.id
    WHERE t.hash = ? AND t.kind = ? AND (t.expires_at IS NULL OR julianday(t.expires_at) > julianday('now'))
      AND g.client_id = ? AND g.resource = ? AND g.revoked = 0
      AND (? = 'refresh' OR (g.redirect_uri = ? AND g.challenge = ?))`;
  const params = [
    input.hash,
    input.kind,
    input.clientId,
    input.resource,
    input.kind,
    input.redirectUri,
    input.challenge,
  ];
  const results = await db.batch([
    db
      .prepare(`UPDATE oauth_grants SET revoked = 1 WHERE id IN (${matching} AND t.used = 1)`)
      .bind(...params),
    db
      .prepare(
        `INSERT INTO oauth_tokens (hash, grant_id, kind, expires_at)
      SELECT ?, id, 'access', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour') FROM (${matching} AND t.used = 0)`,
      )
      .bind(input.accessHash, ...params),
    db
      .prepare(
        `INSERT INTO oauth_tokens (hash, grant_id, kind)
      SELECT ?, grant_id, 'refresh' FROM oauth_tokens WHERE hash = ? AND changes() = 1`,
      )
      .bind(input.refreshHash, input.accessHash),
    db
      .prepare("UPDATE oauth_tokens SET used = 1 WHERE hash = ? AND changes() = 1")
      .bind(input.hash),
  ]);
  return results[1].meta.changes === 1 && results[2].meta.changes === 1;
}

export async function accessGrant(hash: string, resource: string): Promise<string | null> {
  const row = await database()
    .prepare(
      `SELECT g.id FROM oauth_grants g JOIN oauth_tokens t ON t.grant_id = g.id
    WHERE t.hash = ? AND t.kind = 'access' AND julianday(t.expires_at) > julianday('now') AND g.revoked = 0 AND g.resource = ?`,
    )
    .bind(hash, resource)
    .first<{ id: string }>();
  return row?.id ?? null;
}

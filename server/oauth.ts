/** Serve personal OAuth authorization using the existing browser session and PKCE. */
import { createHash, randomBytes } from "node:crypto";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { sql } from "./db.js";
import {
  json,
  readJson,
  requireSameOrigin,
  RequestError,
  handleApiError,
  methodNotAllowed,
} from "./http.js";
import {
  approveAuthorization,
  ensureOAuthSchema,
  exchangeCredential,
  getAuthorizationRequest,
} from "./oauth-store.js";

export const OAUTH_SCOPE = "timetable";
export const credential = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("base64url");

export function publicOrigin(): string {
  const url = new URL(process.env.PUBLIC_ORIGIN ?? "");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("PUBLIC_ORIGIN must use HTTPS (HTTP is only permitted on loopback)");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("PUBLIC_ORIGIN must be an origin");
  return url.origin;
}

export function mcpResource() {
  return `${publicOrigin()}/api/mcp`;
}

function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, { status });
}

function redirect(uri: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: uri, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export function validRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !url.hash &&
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export async function oauthHandler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const origin = publicOrigin();
    if (url.origin !== origin) return oauthError("invalid_request", "Unexpected host", 400);
    const action = url.searchParams.get("action");
    if (request.method === "GET" && action === "resource")
      return json({
        resource: mcpResource(),
        authorization_servers: [origin],
        scopes_supported: [OAUTH_SCOPE],
        bearer_methods_supported: ["header"],
      });
    if (request.method === "GET" && action === "metadata")
      return json({
        issuer: origin,
        authorization_endpoint: `${origin}/api/oauth?action=authorize`,
        token_endpoint: `${origin}/api/oauth?action=token`,
        registration_endpoint: `${origin}/api/oauth?action=register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: [OAUTH_SCOPE],
        authorization_response_iss_parameter_supported: true,
      });
    await ensureOAuthSchema();
    if (request.method === "POST" && action === "register") {
      const result = OAuthClientMetadataSchema.safeParse(await readJson(request));
      if (!result.success) return oauthError("invalid_client_metadata", "Invalid client metadata");
      const metadata = result.data;
      if (
        !metadata.redirect_uris.length ||
        metadata.redirect_uris.length > 10 ||
        metadata.redirect_uris.some((uri) => uri.length > 2048 || !validRedirect(uri)) ||
        (metadata.token_endpoint_auth_method && metadata.token_endpoint_auth_method !== "none") ||
        metadata.grant_types?.some(
          (type) => !["authorization_code", "refresh_token"].includes(type),
        ) ||
        metadata.response_types?.some((type) => type !== "code") ||
        (metadata.scope && metadata.scope !== OAUTH_SCOPE) ||
        (metadata.client_name?.length ?? 0) > 200
      ) {
        return oauthError(
          "invalid_client_metadata",
          "Only public authorization-code clients with safe redirect URIs are supported",
        );
      }
      const clientId = credential();
      const stored = {
        client_name: metadata.client_name,
        redirect_uris: metadata.redirect_uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: OAUTH_SCOPE,
      };
      const db = sql();
      const registered = await db.transaction([
        db.query("LOCK TABLE oauth_clients IN SHARE ROW EXCLUSIVE MODE"),
        db.query(
          `INSERT INTO oauth_clients (id, metadata) SELECT $1, $2::jsonb
          WHERE (SELECT count(*) FROM oauth_clients WHERE created_at > now() - interval '1 minute') < 30 RETURNING id`,
          [clientId, JSON.stringify(stored)],
        ),
      ]);
      if (!registered[1].length)
        return oauthError(
          "temporarily_unavailable",
          "Too many registrations; retry in a minute",
          429,
        );
      return json(
        { ...stored, client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000) },
        { status: 201 },
      );
    }
    if (request.method === "GET" && action === "authorize") {
      const params = url.searchParams;
      const clientId = params.get("client_id");
      const rows = await sql().query("SELECT metadata FROM oauth_clients WHERE id = $1", [
        clientId,
      ]);
      const metadata = rows[0]?.metadata;
      const redirectUri = params.get("redirect_uri") ?? "";
      const challenge = params.get("code_challenge") ?? "";
      if (
        !metadata ||
        !metadata.redirect_uris.includes(redirectUri) ||
        !validRedirect(redirectUri) ||
        params.get("response_type") !== "code" ||
        params.get("code_challenge_method") !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
        params.get("resource") !== mcpResource() ||
        (params.get("scope") ?? OAUTH_SCOPE) !== OAUTH_SCOPE ||
        (params.get("state")?.length ?? 0) > 2048
      ) {
        return oauthError("invalid_request", "Invalid authorization request");
      }
      const id = credential();
      const data = {
        clientId,
        clientName: metadata.client_name || "MCP 客户端",
        redirectUri,
        challenge,
        resource: mcpResource(),
        state: params.get("state") ?? "",
      };
      const db = sql();
      const pending = await db.transaction([
        db.query("LOCK TABLE oauth_requests IN SHARE ROW EXCLUSIVE MODE"),
        db.query("DELETE FROM oauth_requests WHERE expires_at <= now()"),
        db.query(
          `INSERT INTO oauth_requests (id, data, expires_at) SELECT $1, $2::jsonb, now() + interval '10 minutes'
          WHERE (SELECT count(*) FROM oauth_requests) < 100 RETURNING id`,
          [id, JSON.stringify(data)],
        ),
      ]);
      if (!pending[2].length)
        return oauthError("temporarily_unavailable", "Too many pending authorizations", 429);
      return redirect(`${origin}/?oauth_request=${id}`);
    }
    if (request.method === "POST" && action === "token") {
      if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
        return oauthError("invalid_request", "Expected form encoding");
      const params = new URLSearchParams(await request.text());
      const grantType = params.get("grant_type");
      if (grantType !== "authorization_code" && grantType !== "refresh_token")
        return oauthError("unsupported_grant_type", "Unsupported grant type");
      if (params.has("scope") && params.get("scope") !== OAUTH_SCOPE)
        return oauthError("invalid_scope", "Unknown scope");
      const verifier = params.get("code_verifier") ?? "";
      if (grantType === "authorization_code" && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
        return oauthError("invalid_grant", "Invalid PKCE verifier");
      const access = credential(),
        refresh = credential();
      const success = await exchangeCredential({
        hash: tokenHash(
          params.get(grantType === "authorization_code" ? "code" : "refresh_token") ?? "",
        ),
        kind: grantType === "authorization_code" ? "code" : "refresh",
        clientId: params.get("client_id") ?? "",
        resource: params.get("resource") ?? mcpResource(),
        redirectUri: params.get("redirect_uri") ?? "",
        challenge: tokenHash(verifier),
        accessHash: tokenHash(access),
        refreshHash: tokenHash(refresh),
      });
      return success
        ? json(
            {
              access_token: access,
              token_type: "Bearer",
              expires_in: 3600,
              refresh_token: refresh,
              scope: OAUTH_SCOPE,
            },
            { headers: { Pragma: "no-cache" } },
          )
        : oauthError(
            "invalid_grant",
            "Credential expired, revoked, already used, or does not match this client",
          );
    }
    if (["consent", "connections"].includes(action ?? "")) {
      requireAuth(request);
      if (request.method !== "GET") requireSameOrigin(request);
      if (action === "consent") {
        const id = url.searchParams.get("id") ?? "";
        const pending = await getAuthorizationRequest(id);
        if (!pending) throw new RequestError(400, "授权申请已过期或已处理，请从 Codex 重新连接。");
        if (request.method === "GET")
          return json({ clientName: pending.clientName, redirectUri: pending.redirectUri });
        if (request.method === "POST") {
          const { approve } = z.object({ approve: z.boolean() }).parse(await readJson(request));
          const callback = new URL(pending.redirectUri);
          if (approve) {
            const code = credential();
            if (!(await approveAuthorization(id, credential(), tokenHash(code))))
              throw new RequestError(409, "授权申请已处理");
            callback.searchParams.set("code", code);
          } else {
            await sql().query("DELETE FROM oauth_requests WHERE id = $1", [id]);
            callback.searchParams.set("error", "access_denied");
          }
          if (pending.state) callback.searchParams.set("state", pending.state);
          callback.searchParams.set("iss", origin);
          return json({ redirectUri: callback.href });
        }
      }
      if (action === "connections") {
        if (request.method === "GET") {
          const connections = await sql()
            .query(`SELECT g.id, c.metadata->>'client_name' AS name, g.created_at AS "createdAt"
            FROM oauth_grants g JOIN oauth_clients c ON c.id = g.client_id WHERE NOT g.revoked ORDER BY g.created_at DESC`);
          return json({ connections });
        }
        if (request.method === "DELETE") {
          const { id } = z
            .object({ id: z.string().min(1).max(200) })
            .parse(await readJson(request));
          await sql().query("UPDATE oauth_grants SET revoked = true WHERE id = $1", [id]);
          return json({ revoked: true });
        }
      }
    }
    return methodNotAllowed(["GET", "POST", "DELETE"]);
  } catch (error) {
    if (error instanceof z.ZodError) return oauthError("invalid_request", "Invalid request fields");
    return handleApiError(error);
  }
}

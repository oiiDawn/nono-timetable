/** Exercise OAuth, MCP transport, and atomic SQL in a disposable PostgreSQL container. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { oauthHandler, tokenHash } from "./oauth";
import { createSessionCookie } from "./auth";
import { accessGrant, ensureOAuthSchema } from "./oauth-store";
import { createLesson, ensureSchema, listLessons, sql, commitMcpLessons } from "./db";
import { mcpHandler, mutateLessons } from "./mcp";
import { lessonSnapshot, type Mutation } from "./mcp-lessons";
import loginApi from "../api/auth/login";
import logoutApi from "../api/auth/logout";
import sessionApi from "../api/auth/session";
import lessonsApi from "../api/lessons/index";
import presetsApi from "../api/lesson-presets";

type Query = { text: string; params: unknown[] };
const database = vi.hoisted(() => ({
  run: async (_queries: Query[]): Promise<Record<string, unknown>[][]> => [],
}));
vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({
    query: (text: string, params: unknown[] = []) => ({
      text,
      params,
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        return database.run([{ text, params }]).then((rows) => resolve(rows[0]), reject);
      },
    }),
    transaction: (queries: Query[]) => database.run(queries),
  }),
}));

const container = process.env.NONO_MCP_TEST_CONTAINER;
const exec = promisify(execFile);
const origin = "https://timetable.test";
const resource = `${origin}/api/mcp`;
const verifier = "v".repeat(43);
let cookie: string;

function csvRows(csv: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(value.replace(/\r$/, ""));
      value = "";
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else value += char;
  }
  const headers = rows.shift() ?? [];
  return rows
    .filter((r) => r.length === headers.length)
    .map((r) =>
      Object.fromEntries(
        headers.map((header, i) => {
          let field: unknown = r[i];
          if (["data", "metadata", "repeat_rule", "location"].includes(header) && r[i])
            field = JSON.parse(r[i]);
          else if (["applied", "revoked"].includes(header)) field = r[i] === "t";
          else if (header === "version") field = Number(r[i]);
          return [header, field];
        }),
      ),
    );
}

function request(action: string, method = "GET", body?: unknown, session = false) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (session) {
    headers.cookie = cookie;
    headers.origin = origin;
  }
  return new Request(`${origin}/api/oauth?action=${action}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function token(params: Record<string, string>) {
  return oauthHandler(
    new Request(`${origin}/api/oauth?action=token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }),
  );
}
async function authorization() {
  const registration = await oauthHandler(
    request("register", "POST", {
      client_name: "Codex test",
      redirect_uris: ["http://127.0.0.1:4444/callback"],
      token_endpoint_auth_method: "none",
    }),
  );
  expect(registration.status).toBe(201);
  const client = await registration.json();
  const params = new URLSearchParams({
    action: "authorize",
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    code_challenge: tokenHash(verifier),
    code_challenge_method: "S256",
    resource,
    state: "original-state",
    scope: "timetable",
  });
  const start = await oauthHandler(new Request(`${origin}/api/oauth?${params}`));
  expect(start.status).toBe(302);
  const pendingId = new URL(start.headers.get("location")!).searchParams.get("oauth_request")!;
  const consent = await oauthHandler(
    request(`consent&id=${pendingId}`, "POST", { approve: true }, true),
  );
  expect(consent.status).toBe(200);
  const callback = new URL((await consent.json()).redirectUri);
  expect(callback.searchParams.get("state")).toBe("original-state");
  const exchange = {
    grant_type: "authorization_code",
    client_id: client.client_id,
    code: callback.searchParams.get("code")!,
    redirect_uri: client.redirect_uris[0],
    code_verifier: verifier,
    resource,
  };
  return { client, exchange };
}
async function connection() {
  const auth = await authorization();
  const response = await token(auth.exchange);
  expect(response.status).toBe(200);
  return { ...auth, tokens: await response.json() };
}

describe.skipIf(!container)("MCP with real PostgreSQL", () => {
  beforeAll(async () => {
    const { stdout } = await exec("docker", [
      "inspect",
      "--format",
      '{{index .Config.Labels "codex.task"}}',
      container!,
    ]);
    if (stdout.trim() !== "nono-mcp-check-20261008")
      throw new Error("Use only the disposable MCP test container");
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@localhost/test");
    vi.stubEnv("PUBLIC_ORIGIN", origin);
    vi.stubEnv("SESSION_SECRET", "s".repeat(32));
    cookie = createSessionCookie(new Request(origin)).split(";")[0];
    database.run = async (queries) => {
      const statements = queries.map(({ text, params }) =>
        text
          .replace(/\$(\d+)/g, (_, n: string) => {
            const value = params[Number(n) - 1];
            return value === null || value === undefined
              ? "NULL"
              : `'${String(value).replaceAll("'", "''")}'`;
          })
          .trim()
          .replace(/;$/, ""),
      );
      const { stdout } = await exec(
        "docker",
        [
          "exec",
          container!,
          "psql",
          "-U",
          "postgres",
          "-q",
          "--csv",
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          `BEGIN;${statements.join(";")};COMMIT;`,
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      return queries.map((_, i) => (i === queries.length - 1 ? csvRows(stdout) : []));
    };
    await sql().query(
      "DROP TABLE IF EXISTS oauth_tokens, oauth_grants, oauth_requests, oauth_clients, lessons, lesson_presets CASCADE",
    );
    await ensureSchema();
    await ensureOAuthSchema();
  }, 30000);
  afterAll(() => vi.unstubAllEnvs());

  it("advertises OAuth discovery and protects consent with login and same origin", async () => {
    expect(
      (await (await oauthHandler(request("metadata"))).json()).code_challenge_methods_supported,
    ).toEqual(["S256"]);
    expect((await oauthHandler(request("connections"))).status).toBe(401);
    expect((await oauthHandler(request("connections", "DELETE", { id: "x" }))).status).toBe(401);
    const forged = request("connections", "DELETE", { id: "x" }, true);
    forged.headers.set("origin", "https://attacker.test");
    expect((await oauthHandler(forged)).status).toBe(403);
    expect(
      (await oauthHandler(request("register", "POST", { redirect_uris: ["javascript:alert(1)"] })))
        .status,
    ).toBe(400);
  });
  it("binds authorization codes to PKCE, client, callback and audience", async () => {
    const { exchange } = await authorization();
    for (const bad of [
      { code_verifier: "w".repeat(43) },
      { redirect_uri: "https://attacker.test" },
      { client_id: "wrong" },
      { resource: "https://other.test/mcp" },
    ]) {
      expect((await token({ ...exchange, ...bad })).status).toBe(400);
    }
    expect((await token(exchange)).status).toBe(200);
  });
  it("rotates refresh credentials and revokes the family when an old credential is replayed", async () => {
    const { client, tokens } = await connection();
    const refresh = {
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource,
    };
    const next = await token(refresh);
    expect(next.status).toBe(200);
    const renewed = await next.json();
    expect(await accessGrant(tokenHash(renewed.access_token), resource)).toBeTruthy();
    expect((await token(refresh)).status).toBe(400);
    expect(await accessGrant(tokenHash(renewed.access_token), resource)).toBeNull();
    expect((await token({ ...refresh, refresh_token: renewed.refresh_token })).status).toBe(400);
  });
  it("serializes simultaneous refreshes and invalidates both access paths after reuse", async () => {
    const { client, tokens } = await connection();
    const refresh = {
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource,
    };
    const replies = await Promise.all([token(refresh), token(refresh)]);
    expect(replies.map((r) => r.status).sort()).toEqual([200, 400]);
    const issued = await replies.find((r) => r.status === 200)!.json();
    expect(await accessGrant(tokenHash(issued.access_token), resource)).toBeNull();
  });
  it("revokes grants immediately, including already-issued access tokens", async () => {
    const { tokens } = await connection();
    const grant = await accessGrant(tokenHash(tokens.access_token), resource);
    expect(grant).toBeTruthy();
    expect((await oauthHandler(request("connections", "DELETE", { id: grant }, true))).status).toBe(
      200,
    );
    expect(await accessGrant(tokenHash(tokens.access_token), resource)).toBeNull();
  });
  it("runs discovery, registration, PKCE exchange and automatic refresh via the SDK OAuth client", async () => {
    let clientInfo: OAuthClientInformationMixed | undefined;
    let tokens: OAuthTokens | undefined;
    let codeVerifier = "";
    let authorizationUrl: URL | undefined;
    const provider: OAuthClientProvider = {
      redirectUrl: "http://127.0.0.1:4555/callback",
      clientMetadata: {
        client_name: "SDK OAuth",
        redirect_uris: ["http://127.0.0.1:4555/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      clientInformation: () => clientInfo,
      saveClientInformation: (value) => {
        clientInfo = value;
      },
      tokens: () => tokens,
      saveTokens: (value) => {
        tokens = value;
      },
      codeVerifier: () => codeVerifier,
      saveCodeVerifier: (value) => {
        codeVerifier = value;
      },
      redirectToAuthorization: (value) => {
        authorizationUrl = value;
      },
      state: () => "sdk-state",
    };
    const fetchFn: typeof fetch = async (input, init) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      if (url.pathname.startsWith("/.well-known/")) {
        url.searchParams.set(
          "action",
          url.pathname.includes("protected-resource") ? "resource" : "metadata",
        );
        url.pathname = "/api/oauth";
        return oauthHandler(new Request(url, req));
      }
      return url.pathname === "/api/mcp" ? mcpHandler(req) : oauthHandler(req);
    };
    expect(await auth(provider, { serverUrl: resource, fetchFn })).toBe("REDIRECT");
    const authorizeResponse = await oauthHandler(new Request(authorizationUrl!));
    const pendingId = new URL(authorizeResponse.headers.get("location")!).searchParams.get(
      "oauth_request",
    );
    const consent = await oauthHandler(
      request(`consent&id=${pendingId}`, "POST", { approve: true }, true),
    );
    const callback = new URL((await consent.json()).redirectUri);
    expect(
      await auth(provider, {
        serverUrl: resource,
        authorizationCode: callback.searchParams.get("code")!,
        fetchFn,
      }),
    ).toBe("AUTHORIZED");
    expect(tokens?.access_token).toBeTruthy();
    const oldRefresh = tokens!.refresh_token;
    expect(await auth(provider, { serverUrl: resource, fetchFn })).toBe("AUTHORIZED");
    expect(tokens!.refresh_token).not.toBe(oldRefresh);
  }, 15000);
  it("keeps grants after browser logout and allows refresh after access expiry", async () => {
    const { client, tokens } = await connection();
    const logout = await logoutApi.fetch(
      new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { origin, cookie } }),
    );
    expect(logout.status).toBe(200);
    expect(await accessGrant(tokenHash(tokens.access_token), resource)).toBeTruthy();
    await sql().query(
      "UPDATE oauth_tokens SET expires_at = now() - interval '1 second' WHERE hash = $1",
      [tokenHash(tokens.access_token)],
    );
    expect(await accessGrant(tokenHash(tokens.access_token), resource)).toBeNull();
    const refreshed = await token({
      grant_type: "refresh_token",
      client_id: client.client_id,
      refresh_token: tokens.refresh_token,
      resource,
    });
    expect(refreshed.status).toBe(200);
  });
  it("checks full snapshots before split writes and rolls back an invalid split", async () => {
    const { tokens } = await connection();
    const grant = (await accessGrant(tokenHash(tokens.access_token), resource))!;
    const base = {
      id: "atomic",
      version: 0,
      title: "原课程",
      startDate: "2026-10-08",
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      location: null,
      repeat: null,
      createdAt: "",
      updatedAt: "",
    };
    await createLesson(base);
    const snapshot = lessonSnapshot(await listLessons());
    await createLesson({ ...base, id: "concurrent" });
    expect(await commitMcpLessons(snapshot, [{ ...base, title: "不应写入" }], base.id, grant)).toBe(
      false,
    );
    const current = lessonSnapshot(await listLessons());
    await expect(
      commitMcpLessons(
        current,
        [
          { ...base, title: "必须回滚" },
          { ...base, id: "bad-date", startDate: "not-a-date" },
        ],
        base.id,
        grant,
      ),
    ).rejects.toThrow();
    expect((await listLessons()).find((r) => r.id === base.id)?.title).toBe("原课程");
    expect(
      await commitMcpLessons(
        current,
        [
          { ...base, title: "已更新" },
          { ...base, id: "new-series" },
        ],
        base.id,
        grant,
      ),
    ).toBe(true);
    expect((await listLessons()).find((r) => r.id === base.id)?.version).toBe(2);
  });
  it("returns a new confirmation after unrelated timetable changes", async () => {
    const { tokens } = await connection();
    const grant = (await accessGrant(tokenHash(tokens.access_token), resource))!;
    const mutation: Mutation = {
      kind: "create",
      input: {
        requestId: "ce5fc563-4c88-4e50-bc49-428e5e4a9a45",
        lesson: {
          title: "冲突",
          startDate: "2026-10-08",
          startTime: "09:00",
          endTime: "10:00",
          notes: "",
          location: null,
          repeat: null,
        },
      },
    };
    const preview = await mutateLessons(mutation, grant);
    expect(preview.structuredContent.status).toBe("confirmation_required");
    mutation.input.confirmation = preview.structuredContent.confirmation as string;
    const old = (await listLessons())[0];
    await createLesson({ ...old, id: "unrelated", startDate: "2027-01-01" });
    const updated = await mutateLessons(mutation, grant);
    expect(updated.structuredContent.status).toBe("confirmation_required");
    expect(updated.structuredContent.confirmation).not.toBe(mutation.input.confirmation);
    mutation.input.confirmation = updated.structuredContent.confirmation as string;
    expect((await mutateLessons(mutation, grant)).structuredContent.status).toBe("applied");
    await expect(mutateLessons(mutation, grant)).rejects.toThrow("requestId");
  });
  it("serves initialize, tools/list and authenticated tool calls through the official MCP client", async () => {
    const { tokens } = await connection();
    expect((await mcpHandler(new Request(resource, { method: "POST" }))).status).toBe(401);
    const client = new Client({ name: "integration-client", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      fetch: async (url, init) =>
        mcpHandler(new Request(url instanceof URL ? url.href : url, init)),
    });
    await client.connect(transport);
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
      "create_lesson",
      "delete_lesson",
      "list_lessons",
      "list_students",
      "update_lesson",
    ]);
    const response = await client.callTool({
      name: "list_lessons",
      arguments: { from: "2026-10-01", to: "2026-10-31" },
    });
    expect(response.isError).toBe(false);
    expect(
      (response.structuredContent as { occurrences: unknown[] }).occurrences.length,
    ).toBeGreaterThan(0);
    await client.close();
  });

  it.skipIf(!process.env.NONO_MCP_BROWSER_CHECK)(
    "serves the real APIs and built UI for manual browser verification",
    async () => {
      const previewOrigin = "http://127.0.0.1:4175";
      vi.stubEnv("PUBLIC_ORIGIN", previewOrigin);
      vi.stubEnv(
        "APP_PASSWORD_HASH",
        `scrypt$test-salt$${scryptSync("mcp-local-check", "test-salt", 64).toString("hex")}`,
      );
      const dist = path.resolve("dist");
      await new Promise<void>((resolve, reject) => {
        const server = createServer(async (incoming, outgoing) => {
          try {
            const url = new URL(incoming.url!, previewOrigin);
            if (url.pathname === "/__test__/stop") {
              outgoing.end("stopped");
              server.close(() => resolve());
              return;
            }
            const handlers: Record<
              string,
              { fetch: (request: Request) => Response | Promise<Response> }
            > = {
              "/api/oauth": { fetch: oauthHandler },
              "/api/mcp": { fetch: mcpHandler },
              "/api/auth/login": loginApi,
              "/api/auth/logout": logoutApi,
              "/api/auth/session": sessionApi,
              "/api/lessons": lessonsApi,
              "/api/lesson-presets": presetsApi,
            };
            if (url.pathname.startsWith("/.well-known/")) {
              url.searchParams.set(
                "action",
                url.pathname.includes("protected-resource") ? "resource" : "metadata",
              );
              url.pathname = "/api/oauth";
            }
            if (handlers[url.pathname]) {
              const parts: Buffer[] = [];
              for await (const part of incoming) parts.push(Buffer.from(part));
              const body = Buffer.concat(parts);
              const headers = new Headers();
              for (const [key, value] of Object.entries(incoming.headers))
                if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
              const response = await handlers[url.pathname].fetch(
                new Request(url, {
                  method: incoming.method,
                  headers,
                  body: body.length ? body : undefined,
                }),
              );
              outgoing.writeHead(response.status, Object.fromEntries(response.headers));
              outgoing.end(Buffer.from(await response.arrayBuffer()));
            } else {
              const filename = path.resolve(
                dist,
                `.${url.pathname === "/" ? "/index.html" : url.pathname}`,
              );
              if (!filename.startsWith(dist + path.sep)) {
                outgoing.writeHead(403);
                outgoing.end();
                return;
              }
              const content = await readFile(filename);
              const types: Record<string, string> = {
                ".html": "text/html",
                ".js": "text/javascript",
                ".css": "text/css",
                ".png": "image/png",
              };
              outgoing.setHeader(
                "content-type",
                types[path.extname(filename)] ?? "application/octet-stream",
              );
              outgoing.end(content);
            }
          } catch {
            outgoing.writeHead(500);
            outgoing.end("Preview request failed");
          }
        });
        server.once("error", reject);
        server.listen(4175, "127.0.0.1", () =>
          console.log(`MCP_BROWSER_READY ${previewOrigin} (disposable password: mcp-local-check)`),
        );
      });
    },
    15 * 60_000,
  );
});

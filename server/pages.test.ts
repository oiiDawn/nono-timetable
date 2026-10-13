/** Verify public routing, authentication boundaries, and OAuth discovery on Pages. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/[[path]]";

afterEach(() => vi.unstubAllEnvs());

function request(path: string, method = "GET") {
  return onRequest({
    request: new Request(`https://timetable.test${path}`, { method }),
    next: async () => new Response("static app"),
  });
}

describe("Pages routing", () => {
  it("serves the application while returning JSON 404s for unknown APIs", async () => {
    expect(await (await request("/")).text()).toBe("static app");
    expect(await (await request("/assets/app.js")).text()).toBe("static app");
    const response = await request("/api/unknown");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it.each([
    ["/api/lessons", "GET"],
    ["/api/lessons/abc", "PUT"],
    ["/api/lessons/split", "POST"],
    ["/api/lesson-presets", "GET"],
    ["/api/settings", "GET"],
    ["/api/locations", "POST"],
  ])("protects %s", async (path, method) => {
    expect((await request(path, method)).status).toBe(401);
  });

  it("exposes an unauthenticated session without touching the database", async () => {
    expect(await (await request("/api/auth/session")).json()).toEqual({ authenticated: false });
  });

  it("preserves the private calendar token check", async () => {
    vi.stubEnv("CALENDAR_FEED_TOKEN", "x".repeat(32));
    expect((await request("/calendar/incorrect.ics")).status).toBe(404);
  });

  it("publishes OAuth discovery with the new canonical origin", async () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://timetable.test");
    const metadata = await (
      await request("/.well-known/oauth-authorization-server?action=other")
    ).json();
    expect(metadata.issuer).toBe("https://timetable.test");
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      expect(await (await request(path)).json()).toMatchObject({
        resource: "https://timetable.test/api/mcp",
        authorization_servers: ["https://timetable.test"],
      });
    }
  });
});

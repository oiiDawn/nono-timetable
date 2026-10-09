/** Verify private place searches, provider parsing, and safe failure responses. */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSessionCookie } from "./auth.js";
import handler from "../api/locations.js";

const upstream = vi.fn();
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-that-is-long-enough");
  vi.stubEnv("AMAP_KEY", "private-test-key");
  vi.stubGlobal("fetch", upstream);
  upstream.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function request(
  query: unknown = "杭州图书馆",
  authenticated = true,
  origin = "https://example.com",
) {
  const url = "https://example.com/api/locations";
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: authenticated ? createSessionCookie(new Request(url)).split(";")[0] : "",
    },
    body: JSON.stringify({ query }),
  });
}

it("requires authentication, same origin, and valid queries before contacting Gaode", async () => {
  expect((await handler.fetch(request("杭州", false))).status).toBe(401);
  expect((await handler.fetch(request("杭州", true, "https://other.com"))).status).toBe(403);
  for (const query of ["", "a", 1, "a".repeat(201)])
    expect((await handler.fetch(request(query))).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("returns full place addresses, excludes missing coordinates, and does not return the key", async () => {
  upstream.mockResolvedValue(
    Response.json({
      status: "1",
      pois: [
        {
          id: "B1",
          name: "杭州图书馆",
          pname: "浙江省",
          cityname: "杭州市",
          adname: "上城区",
          address: "解放东路18号",
          location: "120.212,30.245",
        },
        { name: "无坐标", location: "" },
        { name: "超出范围", location: "999,30" },
      ],
    }),
  );
  const response = await handler.fetch(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.locations).toEqual([
    {
      name: "杭州图书馆",
      address: "浙江省杭州市上城区解放东路18号",
      detail: "",
      poiId: "B1",
      longitude: 120.212,
      latitude: 30.245,
    },
  ]);
  expect(JSON.stringify(body)).not.toContain("private-test-key");
  expect(upstream).toHaveBeenCalledTimes(1);
  const searchUrl = upstream.mock.calls[0][0] as URL;
  expect(searchUrl.searchParams.get("city")).toBe("610000");
  expect(searchUrl.searchParams.get("citylimit")).toBe("true");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("allows manual entry after missing keys, exhausted quota, and network failures without exposing secrets", async () => {
  vi.stubEnv("AMAP_KEY", "");
  expect((await handler.fetch(request())).status).toBe(503);
  expect(upstream).not.toHaveBeenCalled();
  vi.stubEnv("AMAP_KEY", "private-test-key");
  upstream.mockResolvedValueOnce(
    Response.json({ status: "0", info: "OVER_LIMIT", infocode: "10003" }),
  );
  expect((await handler.fetch(request())).status).toBe(502);
  upstream.mockRejectedValueOnce(new Error("https://restapi.amap.com/?key=private-test-key"));
  const failed = await handler.fetch(request());
  expect(failed.status).toBe(502);
  expect(await failed.text()).not.toContain("private-test-key");
  expect(upstream).toHaveBeenCalledTimes(2);
});

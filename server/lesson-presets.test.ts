/** Verify preset CRUD, validation, authentication, and stale-write protection. */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSessionCookie } from "./auth.js";
import type { LessonPreset } from "../src/types/lesson.js";
import { parseLessonPreset, parsePresetIdentity } from "./validation.js";
import handler from "../api/lesson-presets.js";

const store = vi.hoisted(() => new Map<string, LessonPreset>());
vi.mock("./db.js", () => ({
  listLessonPresets: async () => [...store.values()],
  createLessonPreset: async (preset: LessonPreset) => {
    store.set(preset.id, preset);
    return preset;
  },
  updateLessonPreset: async (preset: LessonPreset) => {
    if (store.get(preset.id)?.version !== preset.version) return null;
    const updated = { ...preset, version: preset.version + 1 };
    store.set(preset.id, updated);
    return updated;
  },
  deleteLessonPreset: async (id: string, version: number) =>
    store.get(id)?.version === version && store.delete(id),
}));

beforeEach(() => {
  store.clear();
  vi.stubEnv("SESSION_SECRET", "test-session-secret-that-is-long-enough");
});
afterEach(() => vi.unstubAllEnvs());

function request(
  method: string,
  body?: unknown,
  authenticated = true,
  origin = "https://example.com",
) {
  const url = "https://example.com/api/lesson-presets";
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: authenticated ? createSessionCookie(new Request(url)).split(";")[0] : "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

it("saves, reads on another request, updates, and deletes a preset with version protection", async () => {
  const location = { name: "学生家", address: "杭州", detail: "302" };
  const created = await handler.fetch(
    request("POST", { title: " 小明 ", notes: " 数学一对一 ", location }),
  );
  expect(created.status).toBe(201);
  const { preset } = (await created.json()) as { preset: LessonPreset };
  expect(preset).toMatchObject({ title: "小明", notes: "数学一对一", location, version: 1 });
  expect(await (await handler.fetch(request("GET"))).json()).toEqual({ presets: [preset] });
  const updated = await handler.fetch(request("PUT", { ...preset, notes: "英语" }));
  expect(updated.status).toBe(200);
  expect(await updated.json()).toEqual({ preset: { ...preset, notes: "英语", version: 2 } });
  expect((await handler.fetch(request("PUT", preset))).status).toBe(409);
  expect((await handler.fetch(request("DELETE", preset))).status).toBe(409);
  expect((await handler.fetch(request("DELETE", { ...preset, version: 2 }))).status).toBe(200);
  expect(await (await handler.fetch(request("GET"))).json()).toEqual({ presets: [] });
});

it("rejects unauthenticated reads, cross-origin writes, and invalid input before persistence", async () => {
  expect((await handler.fetch(request("GET", undefined, false))).status).toBe(401);
  expect(
    (await handler.fetch(request("POST", { title: "小明", notes: "" }, true, "https://other.com")))
      .status,
  ).toBe(403);
  for (const body of [
    null,
    { title: " ", notes: "" },
    { title: 1, notes: "" },
    { title: "a".repeat(201), notes: "" },
    { title: "小明", notes: "a".repeat(10001) },
  ]) {
    expect((await handler.fetch(request("POST", body))).status).toBe(400);
  }
  for (const version of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => parsePresetIdentity({ id: "preset", version })).toThrow();
  }
  expect(parseLessonPreset({ title: "小明", notes: "" })).toEqual({
    title: "小明",
    notes: "",
    location: null,
  });
  expect(store.size).toBe(0);
});

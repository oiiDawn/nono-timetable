/** Verify D1 persistence, JSON round-trips and atomic split rollback. */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  createLesson,
  createLessonPreset,
  listLessonPresets,
  listLessons,
  splitLesson,
  updateLesson,
  deleteLesson,
  updateLessonPreset,
  deleteLessonPreset,
} from "./db";
import type { LessonRule } from "../src/types/lesson";
import type { D1Database } from "@cloudflare/workers-types";
import { testDatabase } from "./test-database";
const state = vi.hoisted(() => ({ db: null as D1Database | null }));
vi.mock("./database.js", () => ({ database: () => state.db! }));
let dispose: () => Promise<void>;
describe("D1 persistence", () => {
  beforeAll(async () => {
    const runtime = await testDatabase();
    state.db = runtime.db as unknown as D1Database;
    dispose = runtime.dispose;
  }, 30000);
  afterAll(async () => {
    await dispose?.();
  });
  it("round-trips students and rejects stale updates and deletes", async () => {
    const created = await createLessonPreset({
      id: "student",
      version: 1,
      title: "小明",
      notes: "数学",
      location: { name: "学生家", address: "西安", detail: "302" },
    });
    expect((await listLessonPresets())[0]).toEqual(created);
    const updated = await updateLessonPreset({ ...created, notes: "英语" });
    expect(updated?.version).toBe(2);
    expect(await updateLessonPreset(created)).toBeNull();
    expect(await deleteLessonPreset(created.id, created.version)).toBe(false);
    expect(await deleteLessonPreset(created.id, updated!.version)).toBe(true);
  });
  it("splits once, leaves no new series on stale versions, and rolls back a colliding new id", async () => {
    const base: LessonRule = {
      id: "original",
      version: 0,
      title: "课程",
      startDate: "2026-10-08",
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      location: { name: "A", address: "杭州", detail: "" },
      repeat: { freq: "daily", interval: 1, endType: "count", endCount: 5 },
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const original = (await createLesson(base))!;
    const previous = { ...original, repeat: { ...original.repeat!, endCount: 2 } };
    const next = {
      ...original,
      id: "future",
      startDate: "2026-10-10",
      location: { ...base.location!, name: "B" },
      repeat: { ...original.repeat!, endCount: 3 },
    };
    const result = await splitLesson(previous, next);
    expect(result?.previous).toMatchObject({
      version: 2,
      repeat: { endCount: 2 },
      location: { name: "A" },
    });
    expect(result?.next).toMatchObject({ id: "future", location: { name: "B" } });
    expect(await splitLesson(previous, { ...next, id: "stale-orphan" })).toBeNull();
    expect((await listLessons()).some((lesson) => lesson.id === "stale-orphan")).toBe(false);
    const before = await listLessons();
    expect(await splitLesson({ ...result!.previous, title: "不应保存" }, next)).toBeNull();
    expect(await listLessons()).toEqual(before);
    const current = result!.previous;
    const changed = await updateLesson({ ...current, notes: "updated", location: null });
    expect(changed).toMatchObject({ notes: "updated", location: null, version: 3 });
    expect(await updateLesson(current)).toBeNull();
    expect(await deleteLesson(current.id, current.version)).toBe(false);
    expect(await deleteLesson(current.id, changed!.version)).toBe(true);
  });
});

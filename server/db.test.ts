/** Exercise the actual persistence SQL against an isolated PostgreSQL container. */

import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createLesson,
  createLessonPreset,
  ensureSchema,
  listLessonPresets,
  listLessons,
  splitLesson,
} from "./db";
import type { LessonRule } from "../src/types/lesson";

const database = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<unknown[]> => [],
}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => database }));
const container = process.env.NONO_TEST_POSTGRES_CONTAINER;

describe.skipIf(!container)("PostgreSQL persistence", () => {
  beforeAll(async () => {
    const label = execFileSync(
      "docker",
      ["inspect", "--format", '{{index .Config.Labels "codex.task"}}', container!],
      { encoding: "utf8" },
    ).trim();
    if (label !== "nono-location-check-20261008")
      throw new Error("Use the disposable location-check container only");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    database.query = async (sql, params = []) => {
      let query = sql.trim();
      if (query.startsWith("WITH updated")) {
        query = query.replace(
          "SELECT row_to_json(updated) AS previous, row_to_json(created) AS next",
          "SELECT json_build_object('previous', row_to_json(updated), 'next', row_to_json(created))",
        );
      } else if (/^(INSERT|UPDATE|DELETE)/.test(query) && query.includes("RETURNING")) {
        query = `WITH result AS (${query}) SELECT COALESCE(json_agg(result), '[]') FROM result`;
      } else if (query.startsWith("SELECT")) {
        query = `SELECT COALESCE(json_agg(result), '[]') FROM (${query}) result`;
      }
      query = query.replace(/\$(\d+)/g, (_, index: string) => {
        const value = params[Number(index) - 1];
        if (value === null || value === undefined) return "NULL";
        if (typeof value === "number") return String(value);
        return `'${String(value).replaceAll("'", "''")}'`;
      });
      let output: string;
      try {
        output = execFileSync(
          "docker",
          [
            "exec",
            container!,
            "psql",
            "-U",
            "postgres",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            "VERBOSITY=verbose",
            "-c",
            query,
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ).trim();
      } catch (error) {
        if (error instanceof Error && "stderr" in error) {
          const code = String(error.stderr).match(/ERROR:\s+(\d{5}):/)?.[1];
          Object.assign(error, { code });
        }
        throw error;
      }
      if (!output) return [];
      const parsed: unknown = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [parsed];
    };
    await database.query("DROP TABLE IF EXISTS lesson_presets, lessons");
  });
  afterAll(() => vi.unstubAllEnvs());

  it("adds nullable places idempotently to an existing schema and preserves legacy data", async () => {
    await database.query(`CREATE TABLE lessons (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date DATE NOT NULL,
      start_time VARCHAR(5) NOT NULL, end_time VARCHAR(5) NOT NULL,
      notes TEXT NOT NULL DEFAULT '', repeat_rule JSONB,
      version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(
      "CREATE TABLE lesson_presets (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    await database.query(
      "INSERT INTO lessons (id,title,start_date,start_time,end_time) VALUES ('legacy','旧课程','2026-10-08','09:00','10:00')",
    );
    await ensureSchema();
    await database.query("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS location JSONB");
    await database.query("ALTER TABLE lesson_presets ADD COLUMN IF NOT EXISTS location JSONB");
    expect((await listLessons())[0]).toMatchObject({ id: "legacy", location: null, version: 1 });
    await createLessonPreset({
      id: "student",
      version: 1,
      title: "小明",
      notes: "",
      location: { name: "学生家", address: "杭州", detail: "302" },
    });
    expect((await listLessonPresets())[0].location?.detail).toBe("302");
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
  });
});

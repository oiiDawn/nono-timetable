/** Persist cloud lessons and reusable name/notes presets with optimistic version checks. */

import { neon } from "@neondatabase/serverless";
import { normalizeRepeat } from "../src/lib/repeat.js";
import type { LessonPreset, LessonRule, RepeatRule } from "../src/types/lesson.js";

interface LessonRow {
  id: string;
  title: string;
  start_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  repeat_rule: RepeatRule | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value) throw new Error("Missing DATABASE_URL or POSTGRES_URL");
  return value;
}

function sql() {
  return neon(databaseUrl());
}

let schemaPromise: Promise<unknown> | undefined;

export function ensureSchema(): Promise<unknown> {
  schemaPromise ??= sql()
    .query(
      `
      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_date DATE NOT NULL,
        start_time VARCHAR(5) NOT NULL,
        end_time VARCHAR(5) NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        repeat_rule JSONB,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    )
    .then(() =>
      sql().query(`
      CREATE TABLE IF NOT EXISTS lesson_presets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    )
    .catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  return schemaPromise;
}

function mapRow(row: LessonRow): LessonRule {
  const repeat = normalizeRepeat(row.repeat_rule);
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    startDate: row.start_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    notes: row.notes,
    repeat,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const RETURNING = `
  id, title, start_date::text, start_time, end_time, notes, repeat_rule,
  version, created_at::text, updated_at::text
`;

export async function listLessons(): Promise<LessonRule[]> {
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT ${RETURNING} FROM lessons ORDER BY start_date, start_time, id`,
  )) as LessonRow[];
  return rows.map(mapRow);
}

export async function listLessonPresets(): Promise<LessonPreset[]> {
  await ensureSchema();
  return (await sql().query(
    "SELECT id, title, notes, version FROM lesson_presets ORDER BY created_at, id",
  )) as LessonPreset[];
}

export async function createLessonPreset(preset: LessonPreset): Promise<LessonPreset> {
  await ensureSchema();
  const rows = (await sql().query(
    `INSERT INTO lesson_presets (id, title, notes) VALUES ($1, $2, $3)
     RETURNING id, title, notes, version`,
    [preset.id, preset.title, preset.notes],
  )) as LessonPreset[];
  return rows[0];
}

export async function updateLessonPreset(preset: LessonPreset): Promise<LessonPreset | null> {
  await ensureSchema();
  const rows = (await sql().query(
    `UPDATE lesson_presets SET title = $2, notes = $3, version = version + 1
     WHERE id = $1 AND version = $4 RETURNING id, title, notes, version`,
    [preset.id, preset.title, preset.notes, preset.version],
  )) as LessonPreset[];
  return rows[0] ?? null;
}

export async function deleteLessonPreset(id: string, version: number): Promise<boolean> {
  await ensureSchema();
  const rows = await sql().query(
    "DELETE FROM lesson_presets WHERE id = $1 AND version = $2 RETURNING id",
    [id, version],
  );
  return rows.length === 1;
}

export async function createLesson(rule: LessonRule): Promise<LessonRule | null> {
  await ensureSchema();
  const rows = (await sql().query(
    `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${RETURNING}`,
    [
      rule.id,
      rule.title,
      rule.startDate,
      rule.startTime,
      rule.endTime,
      rule.notes,
      JSON.stringify(rule.repeat),
    ],
  )) as LessonRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateLesson(rule: LessonRule): Promise<LessonRule | null> {
  await ensureSchema();
  const rows = (await sql().query(
    `UPDATE lessons
     SET title = $2, start_date = $3, start_time = $4, end_time = $5,
         notes = $6, repeat_rule = $7::jsonb, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND version = $8
     RETURNING ${RETURNING}`,
    [
      rule.id,
      rule.title,
      rule.startDate,
      rule.startTime,
      rule.endTime,
      rule.notes,
      JSON.stringify(rule.repeat),
      rule.version,
    ],
  )) as LessonRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteLesson(id: string, version: number): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql().query(
    "DELETE FROM lessons WHERE id = $1 AND version = $2 RETURNING id",
    [id, version],
  )) as Array<{ id: string }>;
  return rows.length === 1;
}

export async function splitLesson(
  previous: LessonRule,
  next: LessonRule,
): Promise<{ previous: LessonRule; next: LessonRule } | null> {
  const created = await createLesson(next);
  if (!created) return null;
  const updated = await updateLesson(previous);
  if (!updated) {
    await sql().query("DELETE FROM lessons WHERE id = $1", [created.id]);
    return null;
  }
  return { previous: updated, next: created };
}

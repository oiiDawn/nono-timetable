/** Persist lessons and student defaults with places and optimistic version checks. */

import { neon } from "@neondatabase/serverless";
import { isRecord, normalizeRepeat } from "../src/lib/repeat.js";
import { parseLocation } from "../src/lib/location.js";
import type { LessonPreset, LessonRule, RepeatRule } from "../src/types/lesson.js";

interface LessonRow {
  id: string;
  title: string;
  start_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  location: unknown;
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

export function sql() {
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
        location JSONB,
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
        location JSONB,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    )
    .then(() => sql().query("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS location JSONB"))
    .then(() => sql().query("ALTER TABLE lesson_presets ADD COLUMN IF NOT EXISTS location JSONB"))
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
    location: parseLocation(row.location),
    repeat,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const RETURNING = `
  id, title, start_date::text, start_time, end_time, notes, location, repeat_rule,
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
    "SELECT id, title, notes, location, version FROM lesson_presets ORDER BY created_at, id",
  )) as LessonPreset[];
}

export async function createLessonPreset(preset: LessonPreset): Promise<LessonPreset> {
  await ensureSchema();
  const rows = (await sql().query(
    `INSERT INTO lesson_presets (id, title, notes, location) VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, title, notes, location, version`,
    [preset.id, preset.title, preset.notes, JSON.stringify(preset.location)],
  )) as LessonPreset[];
  return rows[0];
}

export async function updateLessonPreset(preset: LessonPreset): Promise<LessonPreset | null> {
  await ensureSchema();
  const rows = (await sql().query(
    `UPDATE lesson_presets SET title = $2, notes = $3, version = version + 1, location = $5::jsonb
     WHERE id = $1 AND version = $4 RETURNING id, title, notes, location, version`,
    [preset.id, preset.title, preset.notes, preset.version, JSON.stringify(preset.location)],
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
    `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule, location)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
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
      JSON.stringify(rule.location),
    ],
  )) as LessonRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateLesson(rule: LessonRule): Promise<LessonRule | null> {
  await ensureSchema();
  const rows = (await sql().query(
    `UPDATE lessons
     SET title = $2, start_date = $3, start_time = $4, end_time = $5,
         notes = $6, repeat_rule = $7::jsonb, location = $9::jsonb, version = version + 1, updated_at = NOW()
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
      JSON.stringify(rule.location),
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
  await ensureSchema();
  const rows = (await sql()
    .query(
      `WITH updated AS (
      UPDATE lessons
      SET title = $2, start_date = $3, start_time = $4, end_time = $5,
          notes = $6, repeat_rule = $7::jsonb, location = $9::jsonb,
          version = version + 1, updated_at = NOW()
      WHERE id = $1 AND version = $8 RETURNING ${RETURNING}
    ), created AS (
      INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule, location)
      SELECT $10, $11, $12::date, $13, $14, $15, $16::jsonb, $17::jsonb
      FROM updated RETURNING ${RETURNING}
    )
    SELECT row_to_json(updated) AS previous, row_to_json(created) AS next
    FROM updated CROSS JOIN created`,
      [
        previous.id,
        previous.title,
        previous.startDate,
        previous.startTime,
        previous.endTime,
        previous.notes,
        JSON.stringify(previous.repeat),
        previous.version,
        JSON.stringify(previous.location),
        next.id,
        next.title,
        next.startDate,
        next.startTime,
        next.endTime,
        next.notes,
        JSON.stringify(next.repeat),
        JSON.stringify(next.location),
      ],
    )
    .catch((error: unknown) => {
      if (isRecord(error) && error.code === "23505") return [];
      throw error;
    })) as Array<{ previous: LessonRow; next: LessonRow }>;
  return rows[0] ? { previous: mapRow(rows[0].previous), next: mapRow(rows[0].next) } : null;
}

/** Commit an agent plan only while its full snapshot and OAuth grant remain valid. */
export async function commitMcpLessons(
  snapshot: Record<string, number>,
  replacements: LessonRule[],
  removedId: string | null,
  grantId: string,
): Promise<boolean> {
  await ensureSchema();
  const db = sql();
  const results = await db.transaction([
    db.query("LOCK TABLE lessons IN SHARE ROW EXCLUSIVE MODE"),
    db.query(
      `WITH grant_lock AS MATERIALIZED (
      SELECT id FROM oauth_grants WHERE id = $4 AND NOT revoked FOR UPDATE
    ), allowed AS MATERIALIZED (
      SELECT 1 FROM grant_lock WHERE
        COALESCE((SELECT jsonb_object_agg(id, version) FROM lessons), '{}'::jsonb) = $1::jsonb
    ), removed AS (
      DELETE FROM lessons WHERE id = $3 AND EXISTS (SELECT 1 FROM allowed)
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements($2::jsonb) r WHERE r->>'id' = $3)
    ), saved AS (
      INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, location, repeat_rule)
      SELECT r->>'id', r->>'title', (r->>'startDate')::date, r->>'startTime', r->>'endTime',
        r->>'notes', r->'location', r->'repeat' FROM jsonb_array_elements($2::jsonb) r
      WHERE EXISTS (SELECT 1 FROM allowed)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, start_date = EXCLUDED.start_date,
        start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, notes = EXCLUDED.notes,
        location = EXCLUDED.location, repeat_rule = EXCLUDED.repeat_rule,
        version = lessons.version + 1, updated_at = now()
    ) SELECT EXISTS (SELECT 1 FROM allowed) AS applied`,
      [JSON.stringify(snapshot), JSON.stringify(replacements), removedId, grantId],
    ),
  ]);
  return results[1][0]?.applied === true;
}

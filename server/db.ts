import { neon } from "@neondatabase/serverless";
import type { LessonRule, RepeatRule } from "../src/types/lesson.js";

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
    .query(`
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
    `)
    .catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  return schemaPromise;
}

function mapRow(row: LessonRow): LessonRule {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    startDate: row.start_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    notes: row.notes,
    repeat: row.repeat_rule,
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
  const rows = await sql().query(
    `SELECT ${RETURNING} FROM lessons ORDER BY start_date, start_time, id`,
  ) as LessonRow[];
  return rows.map(mapRow);
}

export async function createLesson(rule: LessonRule): Promise<LessonRule | null> {
  await ensureSchema();
  const rows = await sql().query(
    `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${RETURNING}`,
    [rule.id, rule.title, rule.startDate, rule.startTime, rule.endTime, rule.notes, JSON.stringify(rule.repeat)],
  ) as LessonRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateLesson(rule: LessonRule): Promise<LessonRule | null> {
  await ensureSchema();
  const rows = await sql().query(
    `UPDATE lessons
     SET title = $2, start_date = $3, start_time = $4, end_time = $5,
         notes = $6, repeat_rule = $7::jsonb, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND version = $8
     RETURNING ${RETURNING}`,
    [rule.id, rule.title, rule.startDate, rule.startTime, rule.endTime, rule.notes, JSON.stringify(rule.repeat), rule.version],
  ) as LessonRow[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteLesson(id: string, version: number): Promise<boolean> {
  await ensureSchema();
  const rows = await sql().query(
    "DELETE FROM lessons WHERE id = $1 AND version = $2 RETURNING id",
    [id, version],
  ) as Array<{ id: string }>;
  return rows.length === 1;
}

interface MigrationResult {
  existing_count: string;
  inserted_count: string;
}

export async function migrateLessons(rules: LessonRule[]): Promise<{ existing: number; inserted: number }> {
  await ensureSchema();
  const payload = rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    start_date: rule.startDate,
    start_time: rule.startTime,
    end_time: rule.endTime,
    notes: rule.notes,
    repeat_rule: rule.repeat,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  }));
  const rows = await sql().query(
    `WITH existing AS (
       SELECT COUNT(*)::int AS count FROM lessons
     ), input AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, title text, start_date date, start_time text, end_time text,
         notes text, repeat_rule jsonb, created_at timestamptz, updated_at timestamptz
       )
     ), inserted AS (
       INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule, created_at, updated_at)
       SELECT id, title, start_date, start_time, end_time, notes, repeat_rule, created_at, updated_at
       FROM input WHERE (SELECT count FROM existing) = 0
       ON CONFLICT (id) DO NOTHING RETURNING id
     )
     SELECT (SELECT count FROM existing)::text AS existing_count,
            (SELECT COUNT(*) FROM inserted)::text AS inserted_count`,
    [JSON.stringify(payload)],
  ) as MigrationResult[];
  return {
    existing: Number(rows[0]?.existing_count ?? 0),
    inserted: Number(rows[0]?.inserted_count ?? 0),
  };
}

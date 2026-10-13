/** Persist lessons and students in D1 with atomic splits and optimistic version checks. */
import { normalizeRepeat } from "../src/lib/repeat.js";
import { parseLocation } from "../src/lib/location.js";
import type { LessonPreset, LessonRule } from "../src/types/lesson.js";
import { database } from "./database.js";

interface PresetRow extends Omit<LessonPreset, "location"> {
  location: string | null;
}
interface LessonRow {
  id: string;
  title: string;
  start_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  location: string | null;
  repeat_rule: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapPreset(row: PresetRow): LessonPreset {
  return { ...row, location: parseLocation(row.location ? JSON.parse(row.location) : null) };
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
    location: parseLocation(row.location ? JSON.parse(row.location) : null),
    repeat: normalizeRepeat(row.repeat_rule ? JSON.parse(row.repeat_rule) : null),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const columns =
  "id, title, start_date, start_time, end_time, notes, location, repeat_rule, version, created_at, updated_at";
const presetColumns = "id, title, notes, location, version";
const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const lessonValues = (rule: LessonRule) => [
  rule.id,
  rule.title,
  rule.startDate,
  rule.startTime,
  rule.endTime,
  rule.notes,
  JSON.stringify(rule.repeat),
  JSON.stringify(rule.location),
];

export async function listLessons(): Promise<LessonRule[]> {
  const rows = await database()
    .prepare(`SELECT ${columns} FROM lessons ORDER BY start_date, start_time, id`)
    .all<LessonRow>();
  return rows.results.map(mapRow);
}
export async function listLessonPresets(): Promise<LessonPreset[]> {
  const rows = await database()
    .prepare(`SELECT ${presetColumns} FROM lesson_presets ORDER BY created_at, id`)
    .all<PresetRow>();
  return rows.results.map(mapPreset);
}
export async function createLessonPreset(preset: LessonPreset): Promise<LessonPreset> {
  const row = await database()
    .prepare(
      `INSERT INTO lesson_presets (id, title, notes, location) VALUES (?, ?, ?, ?) RETURNING ${presetColumns}`,
    )
    .bind(preset.id, preset.title, preset.notes, JSON.stringify(preset.location))
    .first<PresetRow>();
  return mapPreset(row!);
}
export async function updateLessonPreset(preset: LessonPreset): Promise<LessonPreset | null> {
  const row = await database()
    .prepare(
      `UPDATE lesson_presets SET title = ?, notes = ?, location = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING ${presetColumns}`,
    )
    .bind(preset.title, preset.notes, JSON.stringify(preset.location), preset.id, preset.version)
    .first<PresetRow>();
  return row ? mapPreset(row) : null;
}
export async function deleteLessonPreset(id: string, version: number): Promise<boolean> {
  const result = await database()
    .prepare("DELETE FROM lesson_presets WHERE id = ? AND version = ?")
    .bind(id, version)
    .run();
  return result.meta.changes === 1;
}
export async function createLesson(rule: LessonRule): Promise<LessonRule | null> {
  const row = await database()
    .prepare(
      `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
    )
    .bind(...lessonValues(rule))
    .first<LessonRow>();
  return row ? mapRow(row) : null;
}
export async function updateLesson(rule: LessonRule): Promise<LessonRule | null> {
  const row = await database()
    .prepare(
      `UPDATE lessons SET title = ?, start_date = ?, start_time = ?, end_time = ?, notes = ?, repeat_rule = ?, location = ?, version = version + 1, updated_at = ${now} WHERE id = ? AND version = ? RETURNING ${columns}`,
    )
    .bind(...lessonValues(rule).slice(1), rule.id, rule.version)
    .first<LessonRow>();
  return row ? mapRow(row) : null;
}
export async function deleteLesson(id: string, version: number): Promise<boolean> {
  const result = await database()
    .prepare("DELETE FROM lessons WHERE id = ? AND version = ?")
    .bind(id, version)
    .run();
  return result.meta.changes === 1;
}

/** D1 batches serialize both writes; a conflicting new ID rolls the entire split back. */
export async function splitLesson(
  previous: LessonRule,
  next: LessonRule,
): Promise<{ previous: LessonRule; next: LessonRule } | null> {
  const db = database();
  try {
    const results = await db.batch<LessonRow>([
      db
        .prepare(
          `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, repeat_rule, location)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM lessons WHERE id = ? AND version = ? RETURNING ${columns}`,
        )
        .bind(...lessonValues(next), previous.id, previous.version),
      db
        .prepare(
          `UPDATE lessons SET title = ?, start_date = ?, start_time = ?, end_time = ?, notes = ?, repeat_rule = ?, location = ?, version = version + 1, updated_at = ${now}
        WHERE id = ? AND version = ? AND changes() = 1 RETURNING ${columns}`,
        )
        .bind(...lessonValues(previous).slice(1), previous.id, previous.version),
    ]);
    return results[1].results[0]
      ? { previous: mapRow(results[1].results[0]), next: mapRow(results[0].results[0]) }
      : null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: lessons.id"))
      return null;
    throw error;
  }
}

/** The first batch write guards all mutations with the full snapshot and active grant. */
export async function commitMcpLessons(
  snapshot: Record<string, number>,
  replacements: LessonRule[],
  removedId: string | null,
  grantId: string,
): Promise<boolean> {
  const db = database();
  const statements = [
    db
      .prepare(
        `UPDATE oauth_grants SET revoked = revoked WHERE id = ? AND revoked = 0
    AND (SELECT count(*) FROM lessons) = (SELECT count(*) FROM json_each(?))
    AND NOT EXISTS (SELECT 1 FROM lessons l LEFT JOIN json_each(?) s ON s.key = l.id WHERE s.value IS NULL OR s.value != l.version)`,
      )
      .bind(grantId, JSON.stringify(snapshot), JSON.stringify(snapshot)),
  ];
  if (replacements.length)
    statements.push(
      db
        .prepare(
          `INSERT INTO lessons (id, title, start_date, start_time, end_time, notes, location, repeat_rule)
    SELECT value->>'$.id', value->>'$.title', value->>'$.startDate', value->>'$.startTime', value->>'$.endTime', value->>'$.notes', value->>'$.location', value->>'$.repeat'
    FROM json_each(?) WHERE changes() > 0
    ON CONFLICT (id) DO UPDATE SET title = excluded.title, start_date = excluded.start_date,
      start_time = excluded.start_time, end_time = excluded.end_time, notes = excluded.notes,
      location = excluded.location, repeat_rule = excluded.repeat_rule, version = lessons.version + 1, updated_at = ${now}`,
        )
        .bind(JSON.stringify(replacements)),
    );
  if (removedId && !replacements.some((row) => row.id === removedId))
    statements.push(
      db.prepare("DELETE FROM lessons WHERE id = ? AND changes() > 0").bind(removedId),
    );
  const result = await db.batch(statements);
  return result[0].meta.changes === 1;
}

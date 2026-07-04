import Dexie, { type EntityTable } from "dexie";
import type { LessonRule } from "@/types/lesson";

class TimetableDatabase extends Dexie {
  lessonRules!: EntityTable<LessonRule, "id">;

  constructor() {
    super("nono-timetable");
    this.version(1).stores({
      lessonRules: "id, startDate, updatedAt",
    });
  }
}

export const db = new TimetableDatabase();

export async function getAllLessonRules(): Promise<LessonRule[]> {
  return db.lessonRules.orderBy("startDate").toArray();
}

export async function getLessonRule(id: string): Promise<LessonRule | undefined> {
  return db.lessonRules.get(id);
}

export async function saveLessonRule(rule: LessonRule): Promise<void> {
  await db.lessonRules.put(rule);
}

export async function deleteLessonRule(id: string): Promise<void> {
  await db.lessonRules.delete(id);
}

export function createEmptyRule(partial?: Partial<LessonRule>): LessonRule {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    startDate: "",
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
    repeat: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

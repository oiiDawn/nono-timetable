import Dexie, { type EntityTable } from "dexie";
import type { LessonRule } from "@/types/lesson";

export type LegacyLessonRule = Omit<LessonRule, "version"> & {
  version?: number;
};

class TimetableDatabase extends Dexie {
  lessonRules!: EntityTable<LegacyLessonRule, "id">;

  constructor() {
    super("nono-timetable");
    this.version(1).stores({
      lessonRules: "id, startDate, updatedAt",
    });
  }
}

export const db = new TimetableDatabase();

export async function getLegacyLessonRules(): Promise<LegacyLessonRule[]> {
  return db.lessonRules.orderBy("startDate").toArray();
}

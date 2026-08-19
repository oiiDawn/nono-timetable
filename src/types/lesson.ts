/** Lesson series, generated instances, and form state for the timetable. */

export type RepeatEndType = "count" | "date";
export type RepeatFreq = "daily" | "weekly";
export type RepeatPreset = "none" | "daily" | "weekly" | "custom";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface OccurrenceException {
  date: string;
  startTime: string;
  endTime: string;
  title?: string;
  notes?: string;
}

export interface RepeatRule {
  freq: RepeatFreq;
  interval: number;
  byWeekdays?: Weekday[];
  endType: RepeatEndType;
  endCount?: number;
  endDate?: string;
  excludedDates?: string[];
  exceptions?: Record<string, OccurrenceException>;
}

export interface LessonRule {
  id: string;
  version: number;
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  repeat: RepeatRule | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonInstance {
  ruleId: string;
  originalDate: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  notes: string;
  isRecurring: boolean;
  isException: boolean;
}

export interface LessonFormValues {
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  repeatPreset: RepeatPreset;
  freq: RepeatFreq;
  interval: number;
  byWeekdays: Weekday[];
  endType: RepeatEndType;
  endCount: number;
  endDate: string;
}

export interface ConflictInfo {
  instance: LessonInstance;
  conflictsWith: LessonInstance[];
}

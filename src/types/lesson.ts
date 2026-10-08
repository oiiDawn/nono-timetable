/** Lesson series, generated instances, reusable presets, and timetable form state. */

export type RepeatEndType = "count" | "date";
export type RepeatFreq = "daily" | "weekly";
export type RepeatPreset = "none" | "daily" | "weekly" | "custom";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface LessonLocation {
  name: string;
  address: string;
  detail: string;
  poiId?: string;
  longitude?: number;
  latitude?: number;
}

export interface LessonPreset {
  id: string;
  version: number;
  title: string;
  notes: string;
  location: LessonLocation | null;
}

export interface OccurrenceException {
  date: string;
  startTime: string;
  endTime: string;
  title?: string;
  notes?: string;
  location?: LessonLocation | null;
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
  location: LessonLocation | null;
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
  location: LessonLocation | null;
  isRecurring: boolean;
  isException: boolean;
}

export interface LessonFormValues {
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  location: LessonLocation | null;
  locationAction?: "set" | "inherit";
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

export type RepeatEndType = "count" | "date";

export interface RepeatRule {
  intervalDays: number;
  endType: RepeatEndType;
  endCount?: number;
  endDate?: string;
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
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  notes: string;
  isRecurring: boolean;
}

export interface LessonFormValues {
  title: string;
  startDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  isRepeating: boolean;
  intervalDays: number;
  endType: RepeatEndType;
  endCount: number;
  endDate: string;
}

export interface ConflictInfo {
  instance: LessonInstance;
  conflictsWith: LessonInstance[];
}

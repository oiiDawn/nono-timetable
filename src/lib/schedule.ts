/** Calendar layout, instance expansion, conflicts, and lesson form conversion. */

import {
  addDays,
  addMonths,
  formatDate,
  getWeekStart,
  isSameDay,
} from "@/lib/dates";
import { createId } from "@/lib/utils";
import {
  DEFAULT_REPEAT_COUNT,
  listGeneratedOccurrenceDates,
  normalizeRule,
  repeatFromForm,
  repeatPresetOf,
  weekdayFromDate,
} from "@/lib/repeat";
import type {
  ConflictInfo,
  LessonFormValues,
  LessonInstance,
  LessonRule,
} from "@/types/lesson";

export { formatDate, getWeekStart, parseDate, startOfMonth } from "@/lib/dates";

export const SCHEDULE_DAY_START = "08:00";
export const SCHEDULE_DAY_END = "22:00";
export const SCHEDULE_DAY_START_MINUTES = 8 * 60;
export const SCHEDULE_DAY_END_MINUTES = 22 * 60;
export const DEFAULT_LESSON_DURATION_MINUTES = 2 * 60;
export const SCHEDULE_DAY_TOTAL_MINUTES =
  SCHEDULE_DAY_END_MINUTES - SCHEDULE_DAY_START_MINUTES;
export const SCHEDULE_HOUR_COUNT = SCHEDULE_DAY_TOTAL_MINUTES / 60;
export const SCHEDULE_HOUR_HEIGHT_PX = 56;
export const SCHEDULE_BODY_HEIGHT_PX =
  SCHEDULE_HOUR_COUNT * SCHEDULE_HOUR_HEIGHT_PX;
export const SCHEDULE_TIME_INTERVAL_MINUTES = 5;

export const MONTH_GRID_WEEK_COUNT = 6;
export const MONTH_GRID_DAY_COUNT = MONTH_GRID_WEEK_COUNT * 7;
export const VIEW_MODE_STORAGE_KEY = "nono-timetable-view-mode";

export type CalendarViewMode = "month" | "week";

export const WEEKDAY_HEADERS = [
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
] as const;

export function getMonthGridDays(monthStart: Date): Date[] {
  const gridStart = getWeekStart(monthStart);
  return Array.from({ length: MONTH_GRID_DAY_COUNT }, (_, index) =>
    addDays(gridStart, index),
  );
}

export function getMonthGridRange(monthStart: Date): {
  start: Date;
  end: Date;
} {
  const days = getMonthGridDays(monthStart);
  return { start: days[0]!, end: days[days.length - 1]! };
}

export function formatMonthLabel(monthStart: Date): string {
  return `${monthStart.getFullYear()}年${monthStart.getMonth() + 1}月`;
}

export function shiftMonthStart(monthStart: Date, offset: number): Date {
  return addMonths(monthStart, offset);
}

export function loadStoredViewMode(): CalendarViewMode {
  return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "week"
    ? "week"
    : "month";
}

export function storeViewMode(mode: CalendarViewMode): void {
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function formatWeekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function getScheduleTimeOptions(): string[] {
  const options: string[] = [];
  for (
    let minutes = SCHEDULE_DAY_START_MINUTES;
    minutes <= SCHEDULE_DAY_END_MINUTES - DEFAULT_LESSON_DURATION_MINUTES;
    minutes += SCHEDULE_TIME_INTERVAL_MINUTES
  ) {
    options.push(minutesToTime(minutes));
  }
  return options;
}

export function getEndTimeOptions(startTime: string): string[] {
  const startMinutes = timeToMinutes(startTime);
  const options: string[] = [];
  for (
    let minutes = startMinutes + SCHEDULE_TIME_INTERVAL_MINUTES;
    minutes <= SCHEDULE_DAY_END_MINUTES;
    minutes += SCHEDULE_TIME_INTERVAL_MINUTES
  ) {
    options.push(minutesToTime(minutes));
  }
  return options;
}

export function snapMinutesToScheduleInterval(minutes: number): number {
  const snapped =
    Math.round(minutes / SCHEDULE_TIME_INTERVAL_MINUTES) *
    SCHEDULE_TIME_INTERVAL_MINUTES;
  return Math.max(
    SCHEDULE_DAY_START_MINUTES,
    Math.min(SCHEDULE_DAY_END_MINUTES, snapped),
  );
}

export function getTimeFromClickOffset(
  offsetY: number,
  totalHeight: number,
): string {
  const ratio = Math.max(0, Math.min(1, offsetY / totalHeight));
  const minutes =
    SCHEDULE_DAY_START_MINUTES + ratio * SCHEDULE_DAY_TOTAL_MINUTES;
  return minutesToTime(
    Math.min(
      snapMinutesToScheduleInterval(minutes),
      SCHEDULE_DAY_END_MINUTES - DEFAULT_LESSON_DURATION_MINUTES,
    ),
  );
}

export function getDefaultEndTime(startTime: string): string {
  return minutesToTime(
    timeToMinutes(startTime) + DEFAULT_LESSON_DURATION_MINUTES,
  );
}

export function timeToTopPercent(time: string): number {
  return (
    ((timeToMinutes(time) - SCHEDULE_DAY_START_MINUTES) /
      SCHEDULE_DAY_TOTAL_MINUTES) *
    100
  );
}

export function timeRangeToHeightPercent(
  startTime: string,
  endTime: string,
): number {
  return (
    ((timeToMinutes(endTime) - timeToMinutes(startTime)) /
      SCHEDULE_DAY_TOTAL_MINUTES) *
    100
  );
}

export interface LayoutedLessonInstance {
  instance: LessonInstance;
  column: number;
  columnCount: number;
}

export function layoutDayInstances(
  instances: LessonInstance[],
): LayoutedLessonInstance[] {
  if (instances.length === 0) {
    return [];
  }

  const sorted = [...instances].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  const groups: LessonInstance[][] = [];
  let currentGroup: LessonInstance[] = [];
  let groupEnd = -1;

  for (const instance of sorted) {
    const start = timeToMinutes(instance.startTime);
    if (currentGroup.length === 0 || start < groupEnd) {
      currentGroup.push(instance);
      groupEnd = Math.max(groupEnd, timeToMinutes(instance.endTime));
    } else {
      groups.push(currentGroup);
      currentGroup = [instance];
      groupEnd = timeToMinutes(instance.endTime);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const layouted: LayoutedLessonInstance[] = [];

  for (const group of groups) {
    const columns: LessonInstance[][] = [];

    for (const instance of group) {
      let placed = false;
      for (const column of columns) {
        const last = column[column.length - 1];
        if (
          !last ||
          !timesOverlap(
            instance.startTime,
            instance.endTime,
            last.startTime,
            last.endTime,
          )
        ) {
          column.push(instance);
          placed = true;
          break;
        }
      }

      if (!placed) {
        columns.push([instance]);
      }
    }

    const columnCount = columns.length;
    columns.forEach((column, columnIndex) => {
      for (const instance of column) {
        layouted.push({ instance, column: columnIndex, columnCount });
      }
    });
  }

  return layouted;
}

export function isDateInWeek(date: Date, weekStart: Date): boolean {
  const key = formatDate(date);
  return (
    key >= formatDate(weekStart) && key <= formatDate(addDays(weekStart, 6))
  );
}

export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

export function expandRuleOccurrences(
  rule: LessonRule,
  rangeStart: Date,
  rangeEnd: Date,
): LessonInstance[] {
  const normalized = normalizeRule(rule);
  const excluded = new Set(normalized.repeat?.excludedDates ?? []);
  const instances: LessonInstance[] = [];

  for (const originalDate of listGeneratedOccurrenceDates(normalized)) {
    if (excluded.has(originalDate)) continue;
    const instance = createInstance(normalized, originalDate);
    if (
      instance.date < formatDate(rangeStart) ||
      instance.date > formatDate(rangeEnd)
    ) {
      continue;
    }
    instances.push(instance);
  }

  return instances;
}

function createInstance(
  rule: LessonRule,
  originalDate: string,
): LessonInstance {
  const exception = rule.repeat?.exceptions?.[originalDate];
  return {
    ruleId: rule.id,
    originalDate,
    date: exception?.date ?? originalDate,
    title: exception?.title ?? rule.title,
    startTime: exception?.startTime ?? rule.startTime,
    endTime: exception?.endTime ?? rule.endTime,
    notes: exception?.notes ?? rule.notes,
    isRecurring: Boolean(rule.repeat),
    isException: Boolean(exception),
  };
}

export function expandRulesForRange(
  rules: LessonRule[],
  rangeStart: Date,
  rangeEnd: Date,
): LessonInstance[] {
  return rules
    .flatMap((rule) => expandRuleOccurrences(rule, rangeStart, rangeEnd))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
}

export function groupInstancesByDate(
  instances: LessonInstance[],
): Record<string, LessonInstance[]> {
  return instances.reduce<Record<string, LessonInstance[]>>((acc, instance) => {
    if (!acc[instance.date]) {
      acc[instance.date] = [];
    }
    acc[instance.date].push(instance);
    return acc;
  }, {});
}

export function findConflicts(
  candidate: LessonInstance,
  instances: LessonInstance[],
): ConflictInfo | null {
  const conflictsWith = instances.filter(
    (instance) =>
      instance.date === candidate.date &&
      (instance.ruleId !== candidate.ruleId ||
        instance.originalDate !== candidate.originalDate) &&
      timesOverlap(
        candidate.startTime,
        candidate.endTime,
        instance.startTime,
        instance.endTime,
      ),
  );

  if (conflictsWith.length === 0) {
    return null;
  }

  return { instance: candidate, conflictsWith };
}

export function findConflictsForRule(
  rule: LessonRule,
  allRules: LessonRule[],
  rangeStart: Date,
  rangeEnd: Date,
): ConflictInfo[] {
  const allInstances = expandRulesForRange(allRules, rangeStart, rangeEnd);
  const candidateInstances = expandRuleOccurrences(rule, rangeStart, rangeEnd);

  return candidateInstances
    .map((instance) => findConflicts(instance, allInstances))
    .filter((conflict): conflict is ConflictInfo => conflict !== null);
}

export function ruleToFormValues(
  rule: LessonRule,
  instance?: Pick<
    LessonInstance,
    "date" | "title" | "startTime" | "endTime" | "notes"
  >,
): LessonFormValues {
  const normalized = normalizeRule(rule);
  const repeat = normalized.repeat;
  const startDate = instance?.date ?? normalized.startDate;
  return {
    title: instance?.title ?? normalized.title,
    startDate,
    startTime: instance?.startTime ?? normalized.startTime,
    endTime: instance?.endTime ?? normalized.endTime,
    notes: instance?.notes ?? normalized.notes,
    repeatPreset: repeatPresetOf(normalized),
    freq: repeat?.freq ?? "weekly",
    interval: repeat?.interval ?? 1,
    byWeekdays: repeat?.byWeekdays ?? [weekdayFromDate(startDate)],
    endType: repeat?.endType ?? "count",
    endCount: repeat?.endCount ?? DEFAULT_REPEAT_COUNT,
    endDate: repeat?.endDate ?? startDate,
  };
}

export function formValuesToRule(
  values: LessonFormValues,
  existing?: LessonRule,
): LessonRule {
  const now = new Date().toISOString();
  const repeat = repeatFromForm(values);
  if (repeat && existing?.repeat) {
    repeat.exceptions = existing.repeat.exceptions;
    repeat.excludedDates = existing.repeat.excludedDates;
  }

  return {
    id: existing?.id ?? createId(),
    version: existing?.version ?? 0,
    title: values.title.trim(),
    startDate: values.startDate,
    startTime: values.startTime,
    endTime: values.endTime,
    notes: values.notes.trim(),
    repeat,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function validateFormValues(values: LessonFormValues): string | null {
  if (!values.title.trim()) {
    return "请填写课程名称";
  }
  if (!values.startDate) {
    return "请选择开始日期";
  }
  if (timeToMinutes(values.startTime) < SCHEDULE_DAY_START_MINUTES) {
    return "开始时间不能早于 8:00";
  }
  if (timeToMinutes(values.endTime) > SCHEDULE_DAY_END_MINUTES) {
    return "结束时间不能晚于 22:00";
  }
  if (timeToMinutes(values.startTime) >= timeToMinutes(values.endTime)) {
    return "结束时间必须晚于开始时间";
  }
  if (values.repeatPreset !== "none") {
    if (values.interval < 1) {
      return "重复间隔至少为 1";
    }
    if (values.endType === "count" && values.endCount < 1) {
      return "循环次数至少为 1 次";
    }
    if (values.endType === "date" && !values.endDate) {
      return "请选择结束日期";
    }
    if (
      values.endType === "date" &&
      values.endDate &&
      values.endDate < values.startDate
    ) {
      return "结束日期不能早于开始日期";
    }
  }
  return null;
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function weekdayLabel(date: Date): string {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[date.getDay()];
}

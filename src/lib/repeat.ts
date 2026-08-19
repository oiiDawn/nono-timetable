/** Recurrence expansion, exceptions, truncation, and series splits. */

import { addDays, formatDate, getWeekStart, parseDate } from "./dates.js";
import type {
  LessonFormValues,
  LessonRule,
  OccurrenceException,
  RepeatFreq,
  RepeatPreset,
  RepeatRule,
  Weekday,
} from "../types/lesson.js";

export const DEFAULT_REPEAT_COUNT = 5;
export const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const JS_DAY_TO_WEEKDAY: Weekday[] = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: "周一",
  TU: "周二",
  WE: "周三",
  TH: "周四",
  FR: "周五",
  SA: "周六",
  SU: "周日",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function weekdayFromDate(date: string): Weekday {
  return JS_DAY_TO_WEEKDAY[parseDate(date).getDay()]!;
}

export function uniqueWeekdays(days: Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day));
}

export function ensureStartWeekday(
  startDate: string,
  days: Weekday[],
): Weekday[] {
  return uniqueWeekdays([...days, weekdayFromDate(startDate)]);
}

function parseException(value: unknown): OccurrenceException | null {
  if (!isRecord(value)) return null;
  const { date, startTime, endTime, title, notes } = value;
  if (
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string"
  ) {
    return null;
  }
  const exception: OccurrenceException = { date, startTime, endTime };
  if (typeof title === "string") exception.title = title;
  if (typeof notes === "string") exception.notes = notes;
  return exception;
}

function parseExceptions(value: unknown): RepeatRule["exceptions"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const entries: [string, OccurrenceException][] = [];
  for (const [originalDate, raw] of Object.entries(value)) {
    const exception = parseException(raw);
    if (!exception) continue;
    entries.push([originalDate, exception]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseExcludedDates(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dates = value.filter(
    (item): item is string =>
      typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item),
  );
  return dates.length > 0 ? [...new Set(dates)].sort() : undefined;
}

function parseLegacyTimeOverrides(value: unknown): RepeatRule["exceptions"] {
  if (!isRecord(value)) return undefined;
  const entries: [string, OccurrenceException][] = [];
  for (const [date, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    if (typeof raw.startTime !== "string" || typeof raw.endTime !== "string")
      continue;
    entries.push([
      date,
      { date, startTime: raw.startTime, endTime: raw.endTime },
    ]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeRepeat(value: unknown): RepeatRule | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return null;

  const endType =
    value.endType === "date"
      ? "date"
      : value.endType === "count"
        ? "count"
        : null;
  if (!endType) return null;

  const intervalRaw = value.interval ?? value.intervalDays;
  const interval =
    typeof intervalRaw === "number" && intervalRaw >= 1
      ? Math.floor(intervalRaw)
      : 1;
  const freq: RepeatFreq = value.freq === "weekly" ? "weekly" : "daily";

  let byWeekdays: Weekday[] | undefined;
  if (Array.isArray(value.byWeekdays)) {
    byWeekdays = uniqueWeekdays(
      value.byWeekdays.filter((item): item is Weekday =>
        WEEKDAYS.includes(item as Weekday),
      ),
    );
  }

  const exceptions = {
    ...parseLegacyTimeOverrides(value.timeOverrides),
    ...parseExceptions(value.exceptions),
  };
  const excludedDates = parseExcludedDates(value.excludedDates);

  const repeat: RepeatRule = {
    freq,
    interval: Math.max(1, interval),
    endType,
  };
  if (freq === "weekly") {
    repeat.byWeekdays =
      byWeekdays && byWeekdays.length > 0 ? byWeekdays : undefined;
  }
  if (endType === "count") {
    const endCount =
      typeof value.endCount === "number" && value.endCount >= 1
        ? Math.floor(value.endCount)
        : 1;
    repeat.endCount = endCount;
  } else if (typeof value.endDate === "string") {
    repeat.endDate = value.endDate;
  }
  if (exceptions && Object.keys(exceptions).length > 0) {
    repeat.exceptions = exceptions;
  }
  if (excludedDates && excludedDates.length > 0) {
    repeat.excludedDates = excludedDates;
  }
  return repeat;
}

export function normalizeRule(rule: LessonRule): LessonRule {
  const repeat = normalizeRepeat(rule.repeat);
  if (!repeat) return { ...rule, repeat: null };
  if (repeat.freq === "weekly") {
    repeat.byWeekdays = ensureStartWeekday(
      rule.startDate,
      repeat.byWeekdays ?? [],
    );
  }
  return { ...rule, repeat };
}

function isWithinRepeatBounds(
  occurrenceDate: Date,
  repeat: RepeatRule,
  occurrenceIndex: number,
): boolean {
  if (repeat.endType === "count") {
    return occurrenceIndex < (repeat.endCount ?? 1);
  }
  if (repeat.endType === "date" && repeat.endDate) {
    return occurrenceDate <= parseDate(repeat.endDate);
  }
  return true;
}

export function listGeneratedOccurrenceDates(
  rule: LessonRule,
  limit = 10_000,
): string[] {
  const normalized = normalizeRule(rule);
  if (!normalized.repeat) return [normalized.startDate];

  const repeat = normalized.repeat;
  const start = parseDate(normalized.startDate);
  const dates: string[] = [];

  if (repeat.freq === "daily") {
    let index = 0;
    while (index < limit) {
      const current = addDays(start, index * repeat.interval);
      if (!isWithinRepeatBounds(current, repeat, index)) break;
      dates.push(formatDate(current));
      index += 1;
    }
    return dates;
  }

  const weekdays = new Set(
    ensureStartWeekday(normalized.startDate, repeat.byWeekdays ?? []),
  );
  const startWeekMonday = getWeekStart(start);
  let weekIndex = 0;
  let occurrenceIndex = 0;

  while (occurrenceIndex < limit && weekIndex < limit * 2) {
    if (weekIndex % repeat.interval === 0) {
      for (let offset = 0; offset < 7; offset += 1) {
        const current = addDays(startWeekMonday, weekIndex * 7 + offset);
        if (current < start) continue;
        if (!weekdays.has(JS_DAY_TO_WEEKDAY[current.getDay()]!)) continue;
        if (!isWithinRepeatBounds(current, repeat, occurrenceIndex)) {
          return dates;
        }
        dates.push(formatDate(current));
        occurrenceIndex += 1;
        if (occurrenceIndex >= limit) return dates;
      }
    }
    weekIndex += 1;
  }

  return dates;
}

export function isGeneratedOccurrenceDate(
  rule: LessonRule,
  date: string,
): boolean {
  return listGeneratedOccurrenceDates(rule).includes(date);
}

export function isFirstGeneratedOccurrence(
  rule: LessonRule,
  originalDate: string,
): boolean {
  return listGeneratedOccurrenceDates(rule)[0] === originalDate;
}

export function remainingOccurrenceCount(
  rule: LessonRule,
  fromOriginalDate: string,
): number {
  return listGeneratedOccurrenceDates(rule).filter(
    (date) => date >= fromOriginalDate,
  ).length;
}

export function repeatPresetOf(rule: LessonRule): RepeatPreset {
  const repeat = normalizeRepeat(rule.repeat);
  if (!repeat) return "none";
  if (repeat.freq === "daily" && repeat.interval === 1) return "daily";
  const startWeekday = weekdayFromDate(rule.startDate);
  if (
    repeat.freq === "weekly" &&
    repeat.interval === 1 &&
    (repeat.byWeekdays ?? []).length === 1 &&
    repeat.byWeekdays?.[0] === startWeekday
  ) {
    return "weekly";
  }
  return "custom";
}

function compactExceptions(
  exceptions: Record<string, OccurrenceException> | undefined,
): RepeatRule["exceptions"] {
  if (!exceptions) return undefined;
  const keys = Object.keys(exceptions);
  return keys.length > 0 ? exceptions : undefined;
}

function compactExcluded(
  dates: string[] | undefined,
): RepeatRule["excludedDates"] {
  if (!dates || dates.length === 0) return undefined;
  return [...new Set(dates)].sort();
}

function withRepeat(rule: LessonRule, repeat: RepeatRule): LessonRule {
  return {
    ...rule,
    updatedAt: new Date().toISOString(),
    repeat: {
      ...repeat,
      exceptions: compactExceptions(repeat.exceptions),
      excludedDates: compactExcluded(repeat.excludedDates),
    },
  };
}

export function exceptionMatchesSeries(
  rule: LessonRule,
  originalDate: string,
  exception: OccurrenceException,
): boolean {
  return (
    exception.date === originalDate &&
    exception.startTime === rule.startTime &&
    exception.endTime === rule.endTime &&
    (exception.title === undefined || exception.title === rule.title) &&
    (exception.notes === undefined || exception.notes === rule.notes)
  );
}

function storedException(
  rule: LessonRule,
  patch: OccurrenceException,
): OccurrenceException {
  const exception: OccurrenceException = {
    date: patch.date,
    startTime: patch.startTime,
    endTime: patch.endTime,
  };
  if (patch.title !== undefined && patch.title !== rule.title) {
    exception.title = patch.title;
  }
  if (patch.notes !== undefined && patch.notes !== rule.notes) {
    exception.notes = patch.notes;
  }
  return exception;
}

export function setOccurrenceException(
  rule: LessonRule,
  originalDate: string,
  patch: OccurrenceException,
): LessonRule {
  const normalized = normalizeRule(rule);
  if (
    !normalized.repeat ||
    !isGeneratedOccurrenceDate(normalized, originalDate)
  ) {
    return normalized;
  }
  const stored = storedException(normalized, patch);
  const exceptions = { ...(normalized.repeat.exceptions ?? {}) };
  const excludedDates = (normalized.repeat.excludedDates ?? []).filter(
    (date) => date !== originalDate,
  );
  if (exceptionMatchesSeries(normalized, originalDate, stored)) {
    delete exceptions[originalDate];
  } else {
    exceptions[originalDate] = stored;
  }
  return withRepeat(normalized, {
    ...normalized.repeat,
    exceptions,
    excludedDates,
  });
}

export function excludeOccurrence(
  rule: LessonRule,
  originalDate: string,
): LessonRule {
  const normalized = normalizeRule(rule);
  if (
    !normalized.repeat ||
    !isGeneratedOccurrenceDate(normalized, originalDate)
  ) {
    return normalized;
  }
  const exceptions = { ...(normalized.repeat.exceptions ?? {}) };
  delete exceptions[originalDate];
  const excludedDates = [
    ...(normalized.repeat.excludedDates ?? []),
    originalDate,
  ];
  return withRepeat(normalized, {
    ...normalized.repeat,
    exceptions,
    excludedDates,
  });
}

export function reconcileExceptions(rule: LessonRule): {
  rule: LessonRule;
  invalidDates: string[];
} {
  const normalized = normalizeRule(rule);
  if (!normalized.repeat) return { rule: normalized, invalidDates: [] };

  const generated = new Set(listGeneratedOccurrenceDates(normalized));
  const invalidDates: string[] = [];
  const exceptions: Record<string, OccurrenceException> = {};
  for (const [originalDate, exception] of Object.entries(
    normalized.repeat.exceptions ?? {},
  )) {
    if (
      !generated.has(originalDate) ||
      exceptionMatchesSeries(normalized, originalDate, exception)
    ) {
      if (!generated.has(originalDate)) invalidDates.push(originalDate);
      continue;
    }
    exceptions[originalDate] = exception;
  }
  const excludedDates = (normalized.repeat.excludedDates ?? []).filter(
    (date) => {
      if (generated.has(date)) return true;
      invalidDates.push(date);
      return false;
    },
  );

  return {
    invalidDates,
    rule: withRepeat(normalized, {
      ...normalized.repeat,
      exceptions,
      excludedDates,
    }),
  };
}

export function truncateRuleBefore(
  rule: LessonRule,
  originalDate: string,
): LessonRule | null {
  const normalized = normalizeRule(rule);
  if (!normalized.repeat) return null;
  const generated = listGeneratedOccurrenceDates(normalized);
  const kept = generated.filter((date) => date < originalDate);
  if (kept.length === 0) return null;

  const lastKept = kept[kept.length - 1]!;
  const nextRepeat: RepeatRule = {
    ...normalized.repeat,
    exceptions: Object.fromEntries(
      Object.entries(normalized.repeat.exceptions ?? {}).filter(
        ([date]) => date < originalDate,
      ),
    ),
    excludedDates: (normalized.repeat.excludedDates ?? []).filter(
      (date) => date < originalDate,
    ),
  };
  if (normalized.repeat.endType === "count") {
    nextRepeat.endCount = kept.length;
    delete nextRepeat.endDate;
  } else {
    nextRepeat.endDate = lastKept;
    delete nextRepeat.endCount;
  }
  return reconcileExceptions(withRepeat(normalized, nextRepeat)).rule;
}

export function splitSeries(
  rule: LessonRule,
  originalDate: string,
  nextMaster: LessonRule,
): { previous: LessonRule; next: LessonRule } {
  const previous = truncateRuleBefore(rule, originalDate);
  if (!previous) {
    throw new Error("Cannot split at the first occurrence");
  }

  const normalized = normalizeRule(rule);
  const movedExceptions = Object.fromEntries(
    Object.entries(normalized.repeat?.exceptions ?? {}).filter(
      ([date]) => date > originalDate,
    ),
  );
  const movedExcluded = (normalized.repeat?.excludedDates ?? []).filter(
    (date) => date > originalDate,
  );

  let nextRepeat = nextMaster.repeat;
  if (nextRepeat) {
    nextRepeat = {
      ...nextRepeat,
      exceptions: movedExceptions,
      excludedDates: movedExcluded,
    };
  }

  const next = reconcileExceptions({
    ...nextMaster,
    startDate: nextMaster.startDate,
    repeat: nextRepeat,
  }).rule;

  return { previous, next };
}

export function applyAllEventsEdit(
  rule: LessonRule,
  values: Pick<
    LessonRule,
    "title" | "startDate" | "startTime" | "endTime" | "notes" | "repeat"
  >,
  originalDate: string,
): { rule: LessonRule; invalidDates: string[] } {
  const normalized = normalizeRule(rule);
  const first = isFirstGeneratedOccurrence(normalized, originalDate);
  const movedFirstDate = first
    ? normalized.repeat?.exceptions?.[originalDate]?.date
    : undefined;
  const next: LessonRule = {
    ...normalized,
    title: values.title,
    startTime: values.startTime,
    endTime: values.endTime,
    notes: values.notes,
    startDate:
      first && values.startDate !== movedFirstDate
        ? values.startDate
        : normalized.startDate,
    repeat: values.repeat
      ? {
          ...values.repeat,
          exceptions: normalized.repeat?.exceptions,
          excludedDates: normalized.repeat?.excludedDates,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
  if (next.repeat?.freq === "weekly") {
    next.repeat.byWeekdays = ensureStartWeekday(
      next.startDate,
      next.repeat.byWeekdays ?? [],
    );
  }
  return reconcileExceptions(next);
}

export function repeatFromForm(values: LessonFormValues): RepeatRule | null {
  if (values.repeatPreset === "none") return null;

  let freq: RepeatFreq = values.freq;
  let interval = Math.max(1, values.interval);
  let byWeekdays = uniqueWeekdays(values.byWeekdays);

  if (values.repeatPreset === "daily") {
    freq = "daily";
    interval = 1;
    byWeekdays = [];
  } else if (values.repeatPreset === "weekly") {
    freq = "weekly";
    interval = 1;
    byWeekdays = [weekdayFromDate(values.startDate)];
  } else if (freq === "weekly") {
    byWeekdays = ensureStartWeekday(values.startDate, byWeekdays);
  }

  const repeat: RepeatRule = {
    freq,
    interval,
    endType: values.endType,
  };
  if (freq === "weekly") repeat.byWeekdays = byWeekdays;
  if (values.endType === "count") {
    repeat.endCount = Math.max(1, values.endCount);
  } else {
    repeat.endDate = values.endDate;
  }
  return repeat;
}

export function formRepeatSnapshot(values: LessonFormValues): string {
  const repeat = repeatFromForm(values);
  if (!repeat) return "none";
  return JSON.stringify({
    freq: repeat.freq,
    interval: repeat.interval,
    byWeekdays: repeat.byWeekdays ?? [],
    endType: repeat.endType,
    endCount: repeat.endCount ?? null,
    endDate: repeat.endDate ?? null,
  });
}

export function hasRepeatRuleChanged(
  initial: LessonFormValues,
  current: LessonFormValues,
): boolean {
  return formRepeatSnapshot(initial) !== formRepeatSnapshot(current);
}

/** Request body parsing for lesson rules, including legacy repeat JSON. */

import {
  isGeneratedOccurrenceDate,
  normalizeRepeat,
  normalizeRule,
} from "../src/lib/repeat.js";
import type { LessonRule, RepeatRule } from "../src/types/lesson.js";
import { RequestError } from "./http.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:0\d|1\d|2[0-3]):[0-5]\d$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value) && value >= "08:00" && value <= "22:00";
}

function parseRepeat(
  value: unknown,
  startDate: string,
  startTime: string,
  endTime: string,
): RepeatRule | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new RequestError(400, "重复规则无效");

  const hasLegacyInterval = Number.isInteger(value.intervalDays);
  const hasInterval = Number.isInteger(value.interval);
  if (
    !hasLegacyInterval &&
    !hasInterval &&
    value.freq !== "daily" &&
    value.freq !== "weekly"
  ) {
    throw new RequestError(400, "重复间隔无效");
  }

  const interval = (
    hasInterval ? value.interval : value.intervalDays
  ) as number;
  if (!Number.isInteger(interval) || interval < 1 || interval > 36_500) {
    throw new RequestError(400, "重复间隔无效");
  }
  if (
    value.freq !== undefined &&
    value.freq !== "daily" &&
    value.freq !== "weekly"
  ) {
    throw new RequestError(400, "重复频率无效");
  }
  if (value.endType !== "count" && value.endType !== "date") {
    throw new RequestError(400, "重复结束方式无效");
  }
  if (value.endType === "count") {
    if (
      !Number.isInteger(value.endCount) ||
      (value.endCount as number) < 1 ||
      (value.endCount as number) > 10_000
    ) {
      throw new RequestError(400, "重复次数无效");
    }
  } else if (typeof value.endDate !== "string" || !isValidDate(value.endDate)) {
    throw new RequestError(400, "重复结束日期无效");
  }

  const repeat = normalizeRepeat(value);
  if (!repeat) throw new RequestError(400, "重复规则无效");

  const probe: LessonRule = {
    id: "probe",
    version: 1,
    title: "probe",
    startDate,
    startTime,
    endTime,
    notes: "",
    repeat,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (repeat.exceptions) {
    if (Object.keys(repeat.exceptions).length > 10_000) {
      throw new RequestError(400, "临时调课数据过多");
    }
    for (const [originalDate, exception] of Object.entries(repeat.exceptions)) {
      if (!isValidDate(originalDate) || !isValidDate(exception.date)) {
        throw new RequestError(400, "临时调课数据无效");
      }
      if (
        !isValidTime(exception.startTime) ||
        !isValidTime(exception.endTime) ||
        exception.startTime >= exception.endTime
      ) {
        throw new RequestError(400, "临时调课时间无效");
      }
      if (exception.title !== undefined && exception.title.length > 200) {
        throw new RequestError(400, "课程名称无效");
      }
      if (exception.notes !== undefined && exception.notes.length > 10_000) {
        throw new RequestError(400, "备注过长");
      }
      if (!isGeneratedOccurrenceDate(probe, originalDate)) {
        throw new RequestError(400, "临时调课日期不属于循环课程");
      }
    }
  }

  for (const date of repeat.excludedDates ?? []) {
    if (!isValidDate(date) || !isGeneratedOccurrenceDate(probe, date)) {
      throw new RequestError(400, "删除的课次不属于循环课程");
    }
  }

  return normalizeRule(probe).repeat;
}

export function parseLessonRule(value: unknown): LessonRule {
  if (!isRecord(value)) throw new RequestError(400, "课程数据无效");

  const requiredStrings = [
    "id",
    "title",
    "startDate",
    "startTime",
    "endTime",
    "notes",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string") {
      throw new RequestError(400, `课程字段 ${key} 无效`);
    }
  }

  const title = (value.title as string).trim();
  const startDate = value.startDate as string;
  const startTime = value.startTime as string;
  const endTime = value.endTime as string;
  if (!title || title.length > 200) throw new RequestError(400, "课程名称无效");
  if (!(value.id as string) || (value.id as string).length > 200) {
    throw new RequestError(400, "课程 ID 无效");
  }
  if (!isValidDate(startDate)) throw new RequestError(400, "开始日期无效");
  if (
    !TIME_PATTERN.test(startTime) ||
    !TIME_PATTERN.test(endTime) ||
    startTime >= endTime
  ) {
    throw new RequestError(400, "课程时间无效");
  }
  if (startTime < "08:00" || endTime > "22:00") {
    throw new RequestError(400, "课程时间必须在 08:00 至 22:00 之间");
  }
  if ((value.notes as string).length > 10_000)
    throw new RequestError(400, "备注过长");

  const repeat = parseRepeat(value.repeat, startDate, startTime, endTime);
  if (
    repeat?.endType === "date" &&
    repeat.endDate &&
    repeat.endDate < startDate
  ) {
    throw new RequestError(400, "重复结束日期不能早于开始日期");
  }

  return {
    id: value.id as string,
    version: Number.isInteger(value.version) ? (value.version as number) : 0,
    title,
    startDate,
    startTime,
    endTime,
    notes: (value.notes as string).trim(),
    repeat,
    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

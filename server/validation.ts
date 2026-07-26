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

function parseTimeOverrides(value: unknown): RepeatRule["timeOverrides"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new RequestError(400, "临时调课数据无效");
  if (Object.keys(value).length > 10_000) {
    throw new RequestError(400, "临时调课数据过多");
  }

  return Object.fromEntries(
    Object.entries(value).map(([date, override]) => {
      if (!isValidDate(date) || !isRecord(override)) {
        throw new RequestError(400, "临时调课数据无效");
      }
      const startTime = override.startTime;
      const endTime = override.endTime;
      if (
        typeof startTime !== "string" ||
        typeof endTime !== "string" ||
        !TIME_PATTERN.test(startTime) ||
        !TIME_PATTERN.test(endTime) ||
        startTime < "08:00" ||
        endTime > "22:00" ||
        startTime >= endTime
      ) {
        throw new RequestError(400, "临时调课时间无效");
      }
      return [date, { startTime, endTime }];
    }),
  );
}

function isRepeatOccurrenceDate(
  startDate: string,
  repeat: RepeatRule,
  date: string,
): boolean {
  const difference =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
    86_400_000;
  if (difference < 0 || difference % repeat.intervalDays !== 0) return false;
  const index = difference / repeat.intervalDays;
  return repeat.endType === "count"
    ? index < (repeat.endCount ?? 1)
    : date <= (repeat.endDate ?? startDate);
}

function parseRepeat(value: unknown): RepeatRule | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new RequestError(400, "重复规则无效");

  const intervalDays = value.intervalDays;
  const endType = value.endType;
  const timeOverrides = parseTimeOverrides(value.timeOverrides);
  if (
    !Number.isInteger(intervalDays) ||
    (intervalDays as number) < 1 ||
    (intervalDays as number) > 36_500
  ) {
    throw new RequestError(400, "重复间隔无效");
  }
  if (endType !== "count" && endType !== "date") {
    throw new RequestError(400, "重复结束方式无效");
  }

  if (endType === "count") {
    if (
      !Number.isInteger(value.endCount) ||
      (value.endCount as number) < 1 ||
      (value.endCount as number) > 10_000
    ) {
      throw new RequestError(400, "重复次数无效");
    }
    return {
      intervalDays: intervalDays as number,
      endType,
      endCount: value.endCount as number,
      timeOverrides,
    };
  }

  if (typeof value.endDate !== "string" || !isValidDate(value.endDate)) {
    throw new RequestError(400, "重复结束日期无效");
  }
  return {
    intervalDays: intervalDays as number,
    endType,
    endDate: value.endDate,
    timeOverrides,
  };
}

export function parseLessonRule(value: unknown): LessonRule {
  if (!isRecord(value)) throw new RequestError(400, "课程数据无效");

  const requiredStrings = ["id", "title", "startDate", "startTime", "endTime", "notes"] as const;
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
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime) || startTime >= endTime) {
    throw new RequestError(400, "课程时间无效");
  }
  if (startTime < "08:00" || endTime > "22:00") {
    throw new RequestError(400, "课程时间必须在 08:00 至 22:00 之间");
  }
  if ((value.notes as string).length > 10_000) throw new RequestError(400, "备注过长");

  const repeat = parseRepeat(value.repeat);
  if (repeat?.endType === "date" && repeat.endDate && repeat.endDate < startDate) {
    throw new RequestError(400, "重复结束日期不能早于开始日期");
  }
  if (
    repeat?.timeOverrides &&
    Object.keys(repeat.timeOverrides).some(
      (date) => !isRepeatOccurrenceDate(startDate, repeat, date),
    )
  ) {
    throw new RequestError(400, "临时调课日期不属于循环课程");
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
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

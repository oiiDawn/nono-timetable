import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  expandRuleOccurrences,
  findConflicts,
  formatDate,
  formatMonthLabel,
  getDefaultEndTime,
  getEndTimeOptions,
  getMonthGridDays,
  getMonthStart,
  getScheduleTimeOptions,
  getTimeFromClickOffset,
  getWeekStart,
  isOverflowDay,
  layoutDayInstances,
  parseDate,
  validateFormValues,
} from "@/lib/schedule";
import type { LessonFormValues, LessonRule } from "@/types/lesson";

const baseRule: LessonRule = {
  id: "rule-1",
  version: 1,
  title: "钢琴课",
  startDate: "2026-07-06",
  startTime: "09:00",
  endTime: "10:00",
  notes: "",
  repeat: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("schedule", () => {
  it("expands single lesson within week range", () => {
    const weekStart = getWeekStart(parseDate("2026-07-06"));
    const weekEnd = addDays(weekStart, 6);
    const instances = expandRuleOccurrences(baseRule, weekStart, weekEnd);

    expect(instances).toHaveLength(1);
    expect(instances[0]?.date).toBe("2026-07-06");
  });

  it("expands repeating lessons by interval and count", () => {
    const repeatingRule: LessonRule = {
      ...baseRule,
      repeat: {
        intervalDays: 2,
        endType: "count",
        endCount: 3,
      },
    };

    const rangeStart = parseDate("2026-07-06");
    const rangeEnd = addDays(rangeStart, 14);
    const instances = expandRuleOccurrences(repeatingRule, rangeStart, rangeEnd);

    expect(instances.map((item) => item.date)).toEqual([
      "2026-07-06",
      "2026-07-08",
      "2026-07-10",
    ]);
  });

  it("detects overlapping lessons on same day", () => {
    const first = {
      ruleId: "a",
      date: "2026-07-06",
      title: "A",
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      isRecurring: false,
    };
    const second = {
      ruleId: "b",
      date: "2026-07-06",
      title: "B",
      startTime: "09:30",
      endTime: "10:30",
      notes: "",
      isRecurring: false,
    };

    const conflict = findConflicts(first, [second]);
    expect(conflict?.conflictsWith).toHaveLength(1);
  });

  it("validates form values", () => {
    const values: LessonFormValues = {
      title: "",
      startDate: formatDate(new Date()),
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      isRepeating: false,
      intervalDays: 1,
      endType: "count",
      endCount: 1,
      endDate: formatDate(new Date()),
    };

    expect(validateFormValues(values)).toBe("请填写课程名称");
  });

  it("rejects times outside schedule window", () => {
    const values: LessonFormValues = {
      title: "钢琴课",
      startDate: "2026-07-06",
      startTime: "07:45",
      endTime: "10:00",
      notes: "",
      isRepeating: false,
      intervalDays: 1,
      endType: "count",
      endCount: 1,
      endDate: "2026-07-06",
    };

    expect(validateFormValues(values)).toBe("开始时间不能早于 8:00");
  });

  it("offers course times in five-minute intervals", () => {
    const startOptions = getScheduleTimeOptions();
    const endOptions = getEndTimeOptions("09:00");

    expect(startOptions.slice(0, 4)).toEqual(["08:00", "08:05", "08:10", "08:15"]);
    expect(startOptions.at(-1)).toBe("20:00");
    expect(endOptions.slice(0, 3)).toEqual(["09:05", "09:10", "09:15"]);
  });

  it("defaults lessons to two hours and caps selectable starts at 20:00", () => {
    expect(getTimeFromClickOffset(0, 784)).toBe("08:00");
    expect(getTimeFromClickOffset(5, 784)).toBe("08:05");
    expect(getTimeFromClickOffset(784, 784)).toBe("20:00");
    expect(getDefaultEndTime("09:30")).toBe("11:30");
  });

  it("lays out overlapping lessons side by side", () => {
    const first = {
      ruleId: "a",
      date: "2026-07-06",
      title: "A",
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      isRecurring: false,
    };
    const second = {
      ruleId: "b",
      date: "2026-07-06",
      title: "B",
      startTime: "09:30",
      endTime: "10:30",
      notes: "",
      isRecurring: false,
    };

    const layouted = layoutDayInstances([first, second]);
    expect(layouted).toHaveLength(2);
    expect(layouted.every((item) => item.columnCount === 2)).toBe(true);
    expect(new Set(layouted.map((item) => item.column)).size).toBe(2);
  });

  it("builds a 42-day month grid starting on monday", () => {
    const monthStart = getMonthStart(parseDate("2026-07-01"));
    const days = getMonthGridDays(monthStart);

    expect(days).toHaveLength(42);
    expect(days[0]?.getDay()).toBe(1);
    expect(formatDate(days[0]!)).toBe("2026-06-29");
    expect(formatDate(days[days.length - 1]!)).toBe("2026-08-09");
    expect(formatMonthLabel(monthStart)).toBe("2026年7月");
  });

  it("marks overflow days outside the current month", () => {
    const monthStart = getMonthStart(parseDate("2026-07-01"));
    const days = getMonthGridDays(monthStart);

    expect(isOverflowDay(days[0]!, monthStart)).toBe(true);
    expect(isOverflowDay(days[2]!, monthStart)).toBe(false);
  });
});

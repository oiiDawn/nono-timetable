/** Verify recurrence edits, including inherited, fixed, and cleared places. */

import { describe, expect, it } from "vitest";
import {
  applyAllEventsEdit,
  applyOccurrenceEdit,
  excludeOccurrence,
  isFirstGeneratedOccurrence,
  listGeneratedOccurrenceDates,
  normalizeRepeat,
  remainingOccurrenceCount,
  setOccurrenceException,
  splitSeries,
  truncateRuleBefore,
} from "@/lib/repeat";
import { expandRuleOccurrences, findConflicts, parseDate, ruleToFormValues } from "@/lib/schedule";
import type { LessonRule } from "@/types/lesson";

const baseRule: LessonRule = {
  id: "rule-1",
  version: 1,
  title: "钢琴课",
  startDate: "2026-07-06",
  startTime: "09:00",
  endTime: "10:00",
  notes: "",
  location: null,
  repeat: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("repeat", () => {
  it("keeps explicit places and clears when the series changes through the same place", () => {
    const a = { name: "A", address: "杭州", detail: "" };
    const b = { ...a, name: "B" };
    const c = { ...a, name: "C" };
    const rule: LessonRule = {
      ...baseRule,
      location: a,
      repeat: { freq: "daily", interval: 1, endType: "count", endCount: 4 },
    };
    const fixed = setOccurrenceException(rule, "2026-07-07", {
      date: "2026-07-07",
      startTime: "09:00",
      endTime: "10:00",
      location: b,
    });
    const cleared = setOccurrenceException(fixed, "2026-07-08", {
      date: "2026-07-08",
      startTime: "09:00",
      endTime: "10:00",
      location: null,
    });
    const atB = applyAllEventsEdit(
      cleared,
      { ...cleared, location: b, locationAction: "set" },
      "2026-07-06",
    ).rule;
    const atC = applyAllEventsEdit(
      atB,
      { ...atB, location: c, locationAction: "set" },
      "2026-07-06",
    ).rule;
    expect(
      expandRuleOccurrences(atC, parseDate("2026-07-06"), parseDate("2026-07-09")).map(
        (item) => item.location?.name ?? null,
      ),
    ).toEqual(["C", "B", null, "C"]);
    const restored = applyOccurrenceEdit(atC, "2026-07-07", {
      ...ruleToFormValues(atC),
      startDate: "2026-07-07",
      location: c,
      locationAction: "inherit",
    });
    expect(restored.repeat?.exceptions?.["2026-07-07"]).toBeUndefined();
  });

  it("preserves inheritance on time-only edits and preserves fixed places across future splits", () => {
    const a = { name: "A", address: "杭州", detail: "" };
    const b = { ...a, name: "B" };
    const rule: LessonRule = {
      ...baseRule,
      location: a,
      repeat: { freq: "daily", interval: 1, endType: "count", endCount: 4 },
    };
    const timeOnly = applyOccurrenceEdit(rule, "2026-07-07", {
      ...ruleToFormValues(rule),
      startDate: "2026-07-07",
      startTime: "11:00",
      endTime: "12:00",
    });
    expect(timeOnly.repeat?.exceptions?.["2026-07-07"]?.location).toBeUndefined();
    const changed = applyAllEventsEdit(
      timeOnly,
      { ...timeOnly, location: b, locationAction: "set" },
      rule.startDate,
    ).rule;
    expect(
      expandRuleOccurrences(changed, parseDate("2026-07-07"), parseDate("2026-07-07"))[0].location,
    ).toEqual(b);
    for (const location of [b, null]) {
      const fixed = setOccurrenceException(rule, "2026-07-07", {
        date: "2026-07-07",
        startTime: "09:00",
        endTime: "10:00",
        location,
      });
      const nextMaster = {
        ...fixed,
        id: "next",
        location,
        startDate: "2026-07-07",
        startTime: "11:00",
        endTime: "12:00",
        repeat: { ...fixed.repeat!, endCount: 3 },
      };
      const split = splitSeries(fixed, "2026-07-07", nextMaster);
      expect(split.next.location).toEqual(a);
      expect(split.next.repeat?.exceptions?.["2026-07-07"]?.location).toEqual(location);
      const all = applyAllEventsEdit(
        fixed,
        { ...fixed, location, startTime: "11:00" },
        "2026-07-07",
      ).rule;
      expect(all.location).toEqual(a);
      const replaced = splitSeries(fixed, "2026-07-07", { ...nextMaster, location: b }, "set");
      expect(replaced.next.location).toEqual(b);
      expect(replaced.next.repeat?.exceptions?.["2026-07-07"]).toBeUndefined();
    }
  });
  it("normalizes legacy every-N-days rules and time overrides", () => {
    const repeat = normalizeRepeat({
      intervalDays: 2,
      endType: "count",
      endCount: 3,
      timeOverrides: {
        "2026-07-08": { startTime: "13:00", endTime: "15:00" },
      },
    });

    expect(repeat).toMatchObject({
      freq: "daily",
      interval: 2,
      endType: "count",
      endCount: 3,
      exceptions: {
        "2026-07-08": {
          date: "2026-07-08",
          startTime: "13:00",
          endTime: "15:00",
        },
      },
    });
  });

  it("expands weekly lessons on selected weekdays", () => {
    const rule: LessonRule = {
      ...baseRule,
      repeat: {
        freq: "weekly",
        interval: 1,
        byWeekdays: ["MO", "TH"],
        endType: "count",
        endCount: 4,
      },
    };

    expect(listGeneratedOccurrenceDates(rule)).toEqual([
      "2026-07-06",
      "2026-07-09",
      "2026-07-13",
      "2026-07-16",
    ]);
  });

  it("hides excluded occurrences and moves exceptions to a new date", () => {
    const rule: LessonRule = {
      ...baseRule,
      repeat: {
        freq: "daily",
        interval: 2,
        endType: "count",
        endCount: 3,
      },
    };
    const excluded = excludeOccurrence(rule, "2026-07-08");
    const moved = setOccurrenceException(excluded, "2026-07-10", {
      date: "2026-07-11",
      startTime: "14:00",
      endTime: "16:00",
      title: "补课",
    });
    const instances = expandRuleOccurrences(
      moved,
      parseDate("2026-07-06"),
      parseDate("2026-07-12"),
    );

    expect(
      instances.map((item) => ({
        originalDate: item.originalDate,
        date: item.date,
        title: item.title,
        startTime: item.startTime,
      })),
    ).toEqual([
      {
        originalDate: "2026-07-06",
        date: "2026-07-06",
        title: "钢琴课",
        startTime: "09:00",
      },
      {
        originalDate: "2026-07-10",
        date: "2026-07-11",
        title: "补课",
        startTime: "14:00",
      },
    ]);
  });

  it("truncates a series before a date and splits the remainder into a new series", () => {
    const rule: LessonRule = {
      ...baseRule,
      repeat: {
        freq: "daily",
        interval: 2,
        endType: "count",
        endCount: 4,
        exceptions: {
          "2026-07-10": {
            date: "2026-07-10",
            startTime: "13:00",
            endTime: "15:00",
          },
        },
      },
    };

    expect(isFirstGeneratedOccurrence(rule, "2026-07-06")).toBe(true);
    expect(remainingOccurrenceCount(rule, "2026-07-10")).toBe(2);
    expect(truncateRuleBefore(rule, "2026-07-06")).toBeNull();

    const split = splitSeries(rule, "2026-07-10", {
      ...rule,
      id: "rule-2",
      startDate: "2026-07-10",
      startTime: "14:00",
      endTime: "16:00",
      repeat: {
        freq: "daily",
        interval: 2,
        endType: "count",
        endCount: remainingOccurrenceCount(rule, "2026-07-10"),
      },
    });

    expect(listGeneratedOccurrenceDates(split.previous)).toEqual(["2026-07-06", "2026-07-08"]);
    expect(listGeneratedOccurrenceDates(split.next)).toEqual(["2026-07-10", "2026-07-12"]);
    expect(split.next.startTime).toBe("14:00");
    expect(split.next.repeat?.exceptions?.["2026-07-10"]).toBeUndefined();
  });

  it("keeps matching exceptions when the series time changes", () => {
    const rule: LessonRule = {
      ...baseRule,
      repeat: {
        freq: "daily",
        interval: 2,
        endType: "count",
        endCount: 3,
        exceptions: {
          "2026-07-08": {
            date: "2026-07-09",
            startTime: "13:00",
            endTime: "15:00",
          },
        },
      },
    };
    const updated = applyAllEventsEdit(
      rule,
      {
        title: "钢琴课",
        startDate: "2026-07-06",
        startTime: "11:00",
        endTime: "12:00",
        notes: "",
        location: null,
        repeat: rule.repeat,
      },
      "2026-07-10",
    ).rule;

    expect(updated.startTime).toBe("11:00");
    expect(updated.startDate).toBe("2026-07-06");
    expect(updated.repeat?.exceptions?.["2026-07-08"]).toEqual({
      date: "2026-07-09",
      startTime: "13:00",
      endTime: "15:00",
    });
  });

  it("does not rewrite the series start from a moved first occurrence", () => {
    const rule: LessonRule = {
      ...baseRule,
      repeat: {
        freq: "daily",
        interval: 2,
        endType: "count",
        endCount: 3,
        exceptions: {
          "2026-07-06": {
            date: "2026-07-07",
            startTime: "13:00",
            endTime: "15:00",
          },
        },
      },
    };
    const updated = applyAllEventsEdit(
      rule,
      {
        title: "钢琴课改名",
        startDate: "2026-07-07",
        startTime: "11:00",
        endTime: "12:00",
        notes: "",
        location: null,
        repeat: rule.repeat,
      },
      "2026-07-06",
    ).rule;

    expect(updated.startDate).toBe("2026-07-06");
    expect(updated.startTime).toBe("11:00");
    expect(updated.title).toBe("钢琴课改名");
    expect(updated.repeat?.exceptions?.["2026-07-06"]?.date).toBe("2026-07-07");
  });

  it("detects overlapping instances from the same series", () => {
    const first = {
      ruleId: "a",
      originalDate: "2026-07-06",
      date: "2026-07-09",
      title: "A",
      startTime: "09:00",
      endTime: "10:00",
      notes: "",
      location: null,
      isRecurring: true,
      isException: true,
    };
    const second = {
      ruleId: "a",
      originalDate: "2026-07-09",
      date: "2026-07-09",
      title: "A",
      startTime: "09:30",
      endTime: "10:30",
      notes: "",
      location: null,
      isRecurring: true,
      isException: false,
    };

    expect(findConflicts(first, [second])?.conflictsWith).toHaveLength(1);
  });
});

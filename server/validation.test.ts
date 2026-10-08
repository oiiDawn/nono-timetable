/** Verify lesson inputs, recurrence boundaries, and saved-place validation. */

import { describe, expect, it } from "vitest";
import { RequestError } from "./http";
import { parseLessonRule } from "./validation";

const validRule = {
  id: "lesson-1",
  version: 1,
  title: "钢琴课",
  startDate: "2026-07-20",
  startTime: "09:00",
  endTime: "10:00",
  notes: "",
  repeat: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("parseLessonRule", () => {
  it("validates manual places and coordinates before normalizing recurrence overrides", () => {
    const location = { name: " 学生家 ", address: "杭州", detail: "302" };
    expect(parseLessonRule({ ...validRule, location }).location?.name).toBe("学生家");
    for (const invalid of [
      "地址",
      { ...location, name: " " },
      { ...location, longitude: 120 },
      { ...location, longitude: Infinity, latitude: 30 },
      { ...location, longitude: 120, latitude: 91 },
      { ...location, address: 1 },
      { ...location, detail: "a".repeat(501) },
    ]) {
      expect(() => parseLessonRule({ ...validRule, location: invalid })).toThrow(RequestError);
      expect(() =>
        parseLessonRule({
          ...validRule,
          repeat: {
            freq: "daily",
            interval: 1,
            endType: "count",
            endCount: 2,
            exceptions: {
              "2026-07-21": {
                date: "2026-07-21",
                startTime: "09:00",
                endTime: "10:00",
                location: invalid,
              },
            },
          },
        }),
      ).toThrow(RequestError);
    }
    const cleared = parseLessonRule({
      ...validRule,
      location,
      repeat: {
        freq: "daily",
        interval: 1,
        endType: "count",
        endCount: 2,
        exceptions: {
          "2026-07-21": {
            date: "2026-07-21",
            startTime: "09:00",
            endTime: "10:00",
            location: null,
          },
        },
      },
    });
    expect(cleared.repeat?.exceptions?.["2026-07-21"]?.location).toBeNull();
  });
  it("accepts a valid cloud lesson", () => {
    expect(parseLessonRule(validRule)).toMatchObject(validRule);
  });

  it("rejects impossible dates and out-of-window times", () => {
    expect(() => parseLessonRule({ ...validRule, startDate: "2026-02-30" })).toThrow(RequestError);
    expect(() => parseLessonRule({ ...validRule, startTime: "07:45" })).toThrow(RequestError);
  });

  it("rejects recurrence ending before the first lesson", () => {
    expect(() =>
      parseLessonRule({
        ...validRule,
        repeat: {
          freq: "daily",
          interval: 1,
          endType: "date",
          endDate: "2026-07-19",
        } as never,
      }),
    ).toThrow(RequestError);
  });

  it("accepts valid time overrides and rejects dates outside the recurrence", () => {
    const repeat = {
      freq: "daily" as const,
      interval: 7,
      endType: "count" as const,
      endCount: 3,
      exceptions: {
        "2026-07-27": {
          date: "2026-07-27",
          startTime: "13:00",
          endTime: "15:00",
        },
      },
    };
    expect(parseLessonRule({ ...validRule, repeat }).repeat).toEqual({
      freq: "daily",
      interval: 7,
      endType: "count",
      endCount: 3,
      exceptions: {
        "2026-07-27": {
          date: "2026-07-27",
          startTime: "13:00",
          endTime: "15:00",
        },
      },
    });
    expect(() =>
      parseLessonRule({
        ...validRule,
        repeat: {
          ...repeat,
          exceptions: {
            "2026-07-28": {
              date: "2026-07-28",
              startTime: "13:00",
              endTime: "15:00",
            },
          },
        },
      }),
    ).toThrow("临时调课日期不属于循环课程");
  });
});

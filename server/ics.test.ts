import { describe, expect, it } from "vitest";
import type { LessonRule } from "../src/types/lesson";
import { generateCalendar } from "./ics";

const baseRule: LessonRule = {
  id: "rule-1",
  version: 3,
  title: "钢琴课, 第一组",
  startDate: "2026-07-20",
  startTime: "09:00",
  endTime: "10:00",
  notes: "带教材;\n复习第一章",
  repeat: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-17T01:02:03.000Z",
};

describe("generateCalendar", () => {
  it("generates an Apple-compatible Shanghai event without alarms", () => {
    const calendar = generateCalendar([baseRule]);

    expect(calendar).toContain("BEGIN:VCALENDAR\r\n");
    expect(calendar).toContain("UID:rule-1@nono-timetable\r\n");
    expect(calendar).toContain(
      "DTSTART;TZID=Asia/Shanghai:20260720T090000\r\n",
    );
    expect(calendar).toContain("SUMMARY:钢琴课\\, 第一组\r\n");
    expect(calendar).toContain("DESCRIPTION:带教材\\;\\n复习第一章\r\n");
    expect(calendar).toContain("SEQUENCE:3\r\n");
    expect(calendar).not.toContain("VALARM");
  });

  it("maps count and date recurrence rules", () => {
    const countCalendar = generateCalendar([
      {
        ...baseRule,
        repeat: { freq: "daily", interval: 2, endType: "count", endCount: 5 },
      },
    ]);
    expect(countCalendar).toContain("RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5\r\n");

    const dateCalendar = generateCalendar([
      {
        ...baseRule,
        repeat: {
          freq: "daily",
          interval: 7,
          endType: "date",
          endDate: "2026-08-03",
        },
      },
    ]);
    expect(dateCalendar).toContain(
      "RRULE:FREQ=DAILY;INTERVAL=7;UNTIL=20260803T010000Z\r\n",
    );
  });

  it("emits time overrides as recurrence exceptions", () => {
    const calendar = generateCalendar([
      {
        ...baseRule,
        repeat: {
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
        },
      },
    ]);

    expect(calendar.match(/UID:rule-1@nono-timetable/g)).toHaveLength(2);
    expect(calendar).toContain(
      "RECURRENCE-ID;TZID=Asia/Shanghai:20260727T090000\r\n",
    );
    expect(calendar).toContain(
      "DTSTART;TZID=Asia/Shanghai:20260727T130000\r\n",
    );
    expect(calendar).toContain("DTEND;TZID=Asia/Shanghai:20260727T150000\r\n");
  });

  it("emits weekly BYDAY, EXDATE, and exception summaries", () => {
    const calendar = generateCalendar([
      {
        ...baseRule,
        repeat: {
          freq: "weekly",
          interval: 1,
          byWeekdays: ["MO", "TH"],
          endType: "count",
          endCount: 4,
          excludedDates: ["2026-07-23"],
          exceptions: {
            "2026-07-27": {
              date: "2026-07-28",
              startTime: "13:00",
              endTime: "15:00",
              title: "补课",
            },
          },
        },
      },
    ]);

    expect(calendar).toContain(
      "RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=MO,TH;COUNT=4\r\n",
    );
    expect(calendar).toContain("EXDATE;TZID=Asia/Shanghai:20260723T090000\r\n");
    expect(calendar).toContain(
      "RECURRENCE-ID;TZID=Asia/Shanghai:20260727T090000\r\n",
    );
    expect(calendar).toContain(
      "DTSTART;TZID=Asia/Shanghai:20260728T130000\r\n",
    );
    expect(calendar).toContain("SUMMARY:补课\r\n");
  });

  it("folds long UTF-8 lines to at most 75 bytes", () => {
    const calendar = generateCalendar([
      { ...baseRule, notes: "课程备注".repeat(30) },
    ]);
    for (const line of calendar.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

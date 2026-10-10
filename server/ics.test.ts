/** Verify calendar locations and recurrence identity, escaping, and UTF-8 folding. */

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
  location: null,
  repeat: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-17T01:02:03.000Z",
};

describe("generateCalendar", () => {
  it("exports selected, inherited, and cleared places with stable recurrence identity", () => {
    const location = {
      name: "图书馆",
      address: "杭州市" + "中文地址".repeat(25),
      detail: "302;教室",
      longitude: 120.21,
      latitude: 30.24,
      poiId: "B1",
    };
    const rule: LessonRule = {
      ...baseRule,
      location,
      repeat: {
        freq: "daily",
        interval: 1,
        endType: "count",
        endCount: 4,
        exceptions: {
          "2026-07-21": { date: "2026-07-21", startTime: "11:00", endTime: "12:00" },
          "2026-07-22": {
            date: "2026-07-22",
            startTime: "09:00",
            endTime: "10:00",
            location: { name: "学生家", address: "杭州市上城区", detail: "" },
          },
          "2026-07-23": {
            date: "2026-07-23",
            startTime: "09:00",
            endTime: "10:00",
            location: null,
          },
        },
      },
    };
    const calendar = generateCalendar([rule]);
    const events = calendar.replace(/\r\n /g, "").split("BEGIN:VEVENT").slice(1);
    expect(events[0]).toContain("LOCATION:图书馆");
    expect(events[1]).toContain("LOCATION:图书馆");
    expect(events[1]).toContain("X-APPLE-STRUCTURED-LOCATION;");
    expect(events[1].match(/GEO:[^\r]+/)?.[0]).toBe(events[0].match(/GEO:[^\r]+/)?.[0]);
    expect(events[2]).toContain("LOCATION:学生家");
    expect(events[2]).not.toContain("X-APPLE-STRUCTURED-LOCATION");
    expect(events[3]).toContain("LOCATION:\r\n");
    expect(events[3]).not.toContain("GEO:");
    expect(events.every((event) => event.includes("UID:rule-1@nono-timetable"))).toBe(true);
    for (const line of calendar.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("exports matching location labels and the device-validated WGS-84 coordinates", () => {
    const calendar = generateCalendar([
      {
        ...baseRule,
        location: {
          name: '高新诚园 "东门"^',
          address: "陕西省西安市雁塔区电子四路",
          detail: "302;教室",
          longitude: 108.905595,
          latitude: 34.205872,
        },
      },
    ]).replace(/\r\n /g, "");
    expect(calendar).toContain(
      'LOCATION:高新诚园 "东门"^ · 陕西省西安市雁塔区电子四路 · 302\\;教室\r\n',
    );
    expect(calendar).toContain(
      `X-TITLE="高新诚园 ^'东门^'^^ · 陕西省西安市雁塔区电子四路 · 302;教室":geo:34.207516,108.901013\r\n`,
    );
    expect(calendar).toContain("GEO:34.207516;108.901013\r\n");
    expect(calendar).toContain("DESCRIPTION:带教材\\;\\n复习第一章\r\n");
  });
  it("generates an Apple-compatible Shanghai event without alarms", () => {
    const calendar = generateCalendar([baseRule]);

    expect(calendar).toContain("BEGIN:VCALENDAR\r\n");
    expect(calendar).toContain("TZID:Asia/Shanghai\r\n");
    expect(calendar).not.toContain("BEGIN:VTIMEZONE\r\nTZID=Asia/Shanghai");
    expect(calendar).toContain("UID:rule-1@nono-timetable\r\n");
    expect(calendar).toContain("DTSTART;TZID=Asia/Shanghai:20260720T090000\r\n");
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
    expect(dateCalendar).toContain("RRULE:FREQ=DAILY;INTERVAL=7;UNTIL=20260803T010000Z\r\n");
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
    expect(calendar).toContain("RECURRENCE-ID;TZID=Asia/Shanghai:20260727T090000\r\n");
    expect(calendar).toContain("DTSTART;TZID=Asia/Shanghai:20260727T130000\r\n");
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

    expect(calendar).toContain("RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;BYDAY=MO,TH;COUNT=4\r\n");
    expect(calendar).toContain("EXDATE;TZID=Asia/Shanghai:20260723T090000\r\n");
    expect(calendar).toContain("RECURRENCE-ID;TZID=Asia/Shanghai:20260727T090000\r\n");
    expect(calendar).toContain("DTSTART;TZID=Asia/Shanghai:20260728T130000\r\n");
    expect(calendar).toContain("SUMMARY:补课\r\n");
  });

  it("folds long UTF-8 lines to at most 75 bytes", () => {
    const calendar = generateCalendar([{ ...baseRule, notes: "课程备注".repeat(30) }]);
    for (const line of calendar.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

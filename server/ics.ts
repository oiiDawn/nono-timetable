/** Generate calendar subscriptions with recurrence overrides and Apple map locations. */

import { normalizeRule } from "../src/lib/repeat.js";
import type { LessonLocation, LessonRule } from "../src/types/lesson.js";
import { locationText } from "../src/lib/location.js";
import { calendarCoordinates } from "./calendar-coordinates.js";

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactDate(value: string): string {
  return value.replaceAll("-", "");
}

function localDateTime(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

function utcDateTime(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function shanghaiUntil(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return utcDateTime(new Date(Date.UTC(year, month - 1, day, hour - 8, minute)).toISOString());
}

function foldLine(line: string): string {
  const output: string[] = [];
  let current = "";
  let maxBytes = 75;
  for (const character of line) {
    const next = current + character;
    if (encoder.encode(next).length > maxBytes && current) {
      output.push(current);
      current = character;
      maxBytes = 74;
    } else {
      current = next;
    }
  }
  output.push(current);
  return output.join("\r\n ");
}

function recurrence(rule: LessonRule): string | undefined {
  if (!rule.repeat) return undefined;
  const freq = rule.repeat.freq === "weekly" ? "WEEKLY" : "DAILY";
  const parts = [`FREQ=${freq}`, `INTERVAL=${rule.repeat.interval}`];
  if (rule.repeat.freq === "weekly") {
    parts.push("WKST=MO");
    if (rule.repeat.byWeekdays && rule.repeat.byWeekdays.length > 0) {
      parts.push(`BYDAY=${rule.repeat.byWeekdays.join(",")}`);
    }
  }
  if (rule.repeat.endType === "count") {
    parts.push(`COUNT=${rule.repeat.endCount ?? 1}`);
  } else if (rule.repeat.endDate) {
    parts.push(`UNTIL=${shanghaiUntil(rule.repeat.endDate, rule.startTime)}`);
  }
  return `RRULE:${parts.join(";")}`;
}

function appendEvent(
  lines: string[],
  rule: LessonRule,
  date: string,
  startTime: string,
  endTime: string,
  options?: {
    recurrenceId?: string;
    title?: string;
    notes?: string;
    location?: LessonLocation | null;
  },
): void {
  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeText(rule.id)}@nono-timetable`,
    `DTSTAMP:${utcDateTime(rule.updatedAt)}`,
    `LAST-MODIFIED:${utcDateTime(rule.updatedAt)}`,
    `SEQUENCE:${rule.version}`,
  );
  if (options?.recurrenceId) {
    lines.push(
      `RECURRENCE-ID;TZID=Asia/Shanghai:${localDateTime(options.recurrenceId, rule.startTime)}`,
    );
  }
  const location = options?.location === undefined ? rule.location : options.location;
  const notes = options?.notes ?? rule.notes;
  lines.push(
    `DTSTART;TZID=Asia/Shanghai:${localDateTime(date, startTime)}`,
    `DTEND;TZID=Asia/Shanghai:${localDateTime(date, endTime)}`,
    `SUMMARY:${escapeText(options?.title ?? rule.title)}`,
    `DESCRIPTION:${escapeText(notes)}`,
  );
  if (location || options?.recurrenceId) {
    const title = locationText(location).replace(/[\r\n]+/g, " ");
    lines.push(`LOCATION:${escapeText(title)}`);
    if (location?.longitude !== undefined && location.latitude !== undefined) {
      const [longitude, latitude] = calendarCoordinates(location.longitude, location.latitude);
      const parameter = title.replace(/\^/g, "^^").replace(/"/g, "^'");
      lines.push(
        `GEO:${latitude};${longitude}`,
        `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-APPLE-RADIUS=100;X-TITLE="${parameter}":geo:${latitude},${longitude}`,
      );
    }
  }
}

export function generateCalendar(rules: LessonRule[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nono Timetable//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:排课表",
    "X-WR-TIMEZONE:Asia/Shanghai",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const raw of rules) {
    const rule = normalizeRule(raw);
    appendEvent(lines, rule, rule.startDate, rule.startTime, rule.endTime);
    const rrule = recurrence(rule);
    if (rrule) lines.push(rrule);
    for (const date of rule.repeat?.excludedDates ?? []) {
      lines.push(`EXDATE;TZID=Asia/Shanghai:${localDateTime(date, rule.startTime)}`);
    }
    lines.push("STATUS:CONFIRMED", "END:VEVENT");

    for (const [originalDate, exception] of Object.entries(rule.repeat?.exceptions ?? {})) {
      appendEvent(lines, rule, exception.date, exception.startTime, exception.endTime, {
        recurrenceId: originalDate,
        title: exception.title,
        notes: exception.notes,
        location: exception.location,
      });
      lines.push("STATUS:CONFIRMED", "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

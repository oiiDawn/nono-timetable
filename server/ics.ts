import type { LessonRule } from "../src/types/lesson.js";

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
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
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
  const parts = ["FREQ=DAILY", `INTERVAL=${rule.repeat.intervalDays}`];
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
  recurrenceId?: string,
): void {
  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeText(rule.id)}@nono-timetable`,
    `DTSTAMP:${utcDateTime(rule.updatedAt)}`,
    `LAST-MODIFIED:${utcDateTime(rule.updatedAt)}`,
    `SEQUENCE:${rule.version}`,
  );
  if (recurrenceId) {
    lines.push(
      `RECURRENCE-ID;TZID=Asia/Shanghai:${localDateTime(recurrenceId, rule.startTime)}`,
    );
  }
  lines.push(
    `DTSTART;TZID=Asia/Shanghai:${localDateTime(date, startTime)}`,
    `DTEND;TZID=Asia/Shanghai:${localDateTime(date, endTime)}`,
    `SUMMARY:${escapeText(rule.title)}`,
    `DESCRIPTION:${escapeText(rule.notes)}`,
  );
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

  for (const rule of rules) {
    appendEvent(lines, rule, rule.startDate, rule.startTime, rule.endTime);
    const rrule = recurrence(rule);
    if (rrule) lines.push(rrule);
    lines.push("STATUS:CONFIRMED", "END:VEVENT");

    for (const [date, override] of Object.entries(
      rule.repeat?.timeOverrides ?? {},
    )) {
      appendEvent(
        lines,
        rule,
        date,
        override.startTime,
        override.endTime,
        date,
      );
      lines.push("STATUS:CONFIRMED", "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

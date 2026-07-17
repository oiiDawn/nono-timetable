import { createHash, timingSafeEqual } from "node:crypto";
import { calendarFeedToken } from "../server/auth.js";
import { listLessons } from "../server/db.js";
import { handleApiError, methodNotAllowed } from "../server/http.js";
import { generateCalendar } from "../server/ics.js";

function equalToken(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(["GET", "HEAD"]);
    }
    try {
      const url = new URL(request.url);
      const pathToken = url.pathname.match(/\/calendar\/([^/]+)\.ics$/)?.[1];
      const token = url.searchParams.get("token") ??
        (pathToken ? decodeURIComponent(pathToken) : "");
      if (!equalToken(token, calendarFeedToken())) {
        return new Response("Not found", { status: 404 });
      }

      const calendar = generateCalendar(await listLessons());
      const etag = `"${createHash("sha256").update(calendar).digest("base64url")}"`;
      const headers = new Headers({
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="nono-timetable.ics"',
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: etag,
      });
      if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(request.method === "HEAD" ? null : calendar, { headers });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

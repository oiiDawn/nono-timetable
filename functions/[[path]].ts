/** Route Pages requests to the timetable APIs and serve the Vite app otherwise. */
import login from "../api/auth/login.js";
import logout from "../api/auth/logout.js";
import session from "../api/auth/session.js";
import calendar from "../api/calendar.js";
import presets from "../api/lesson-presets.js";
import lesson from "../api/lessons/[id].js";
import lessons from "../api/lessons/index.js";
import split from "../api/lessons/split.js";
import locations from "../api/locations.js";
import mcp from "../api/mcp.js";
import oauth from "../api/oauth.js";
import settings from "../api/settings.js";
import { json } from "../server/http.js";

type Handler = { fetch(request: Request): Response | Promise<Response> };
const routes: Record<string, Handler> = {
  "/api/auth/login": login,
  "/api/auth/logout": logout,
  "/api/auth/session": session,
  "/api/calendar": calendar,
  "/api/lesson-presets": presets,
  "/api/lessons": lessons,
  "/api/lessons/split": split,
  "/api/locations": locations,
  "/api/mcp": mcp,
  "/api/oauth": oauth,
  "/api/settings": settings,
};

export function onRequest(context: {
  request: Request;
  next(): Promise<Response>;
}): Response | Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/api/mcp"
  ) {
    url.pathname = "/api/oauth";
    url.searchParams.set(
      "action",
      pathname === "/.well-known/oauth-authorization-server" ? "metadata" : "resource",
    );
    return oauth.fetch(new Request(url, request));
  }
  const route = routes[pathname];
  if (route) return route.fetch(request);
  if (/^\/api\/lessons\/[^/]+$/.test(pathname)) return lesson.fetch(request);
  if (/^\/calendar\/[^/]+\.ics$/.test(pathname)) return calendar.fetch(request);
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/.well-known/")) {
    return json({ error: "Not found" }, { status: 404 });
  }
  return context.next();
}

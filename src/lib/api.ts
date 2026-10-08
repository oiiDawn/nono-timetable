/** Call authenticated cloud APIs and expose actionable server errors. */

import type { LessonLocation, LessonPreset, LessonRule } from "@/types/lesson";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "请求失败，请稍后重试";
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export interface McpConnection {
  id: string;
  name: string | null;
  createdAt: string;
}
export function getOAuthRequest(id: string) {
  return requestJson<{ clientName: string; redirectUri: string }>(
    `/api/oauth?action=consent&id=${encodeURIComponent(id)}`,
  );
}
export function decideOAuthRequest(id: string, approve: boolean) {
  return requestJson<{ redirectUri: string }>(
    `/api/oauth?action=consent&id=${encodeURIComponent(id)}`,
    {
      method: "POST",
      body: JSON.stringify({ approve }),
    },
  );
}
export async function getMcpConnections() {
  return (await requestJson<{ connections: McpConnection[] }>("/api/oauth?action=connections"))
    .connections;
}
export async function revokeMcpConnection(id: string) {
  await requestJson("/api/oauth?action=connections", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export async function getSession(): Promise<boolean> {
  const result = await requestJson<{ authenticated: boolean }>("/api/auth/session");
  return result.authenticated;
}

export async function login(password: string): Promise<void> {
  await requestJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function fetchLessons(): Promise<LessonRule[]> {
  const result = await requestJson<{ lessons: LessonRule[] }>("/api/lessons");
  return result.lessons;
}

export async function fetchLessonPresets(): Promise<LessonPreset[]> {
  const result = await requestJson<{ presets: LessonPreset[] }>("/api/lesson-presets");
  return result.presets;
}

export async function saveLessonPreset(
  values: Pick<LessonPreset, "title" | "notes" | "location">,
  existing?: LessonPreset,
): Promise<LessonPreset> {
  const result = await requestJson<{ preset: LessonPreset }>("/api/lesson-presets", {
    method: existing ? "PUT" : "POST",
    body: JSON.stringify({ ...existing, ...values }),
  });
  return result.preset;
}

export async function removeLessonPreset(preset: LessonPreset): Promise<void> {
  await requestJson("/api/lesson-presets", {
    method: "DELETE",
    body: JSON.stringify({ id: preset.id, version: preset.version }),
  });
}

export async function createLesson(rule: LessonRule): Promise<LessonRule> {
  const result = await requestJson<{ lesson: LessonRule }>("/api/lessons", {
    method: "POST",
    body: JSON.stringify(rule),
  });
  return result.lesson;
}

export async function updateLesson(rule: LessonRule): Promise<LessonRule> {
  const result = await requestJson<{ lesson: LessonRule }>(
    `/api/lessons/${encodeURIComponent(rule.id)}`,
    { method: "PUT", body: JSON.stringify(rule) },
  );
  return result.lesson;
}

export async function splitLesson(
  previous: LessonRule,
  next: LessonRule,
): Promise<{ previous: LessonRule; next: LessonRule }> {
  const result = await requestJson<{ previous: LessonRule; next: LessonRule }>(
    "/api/lessons/split",
    { method: "POST", body: JSON.stringify({ previous, next }) },
  );
  return result;
}

export async function removeLesson(rule: LessonRule): Promise<void> {
  await requestJson(`/api/lessons/${encodeURIComponent(rule.id)}`, {
    method: "DELETE",
    body: JSON.stringify({ version: rule.version }),
  });
}

export async function getCalendarUrl(): Promise<string> {
  const result = await requestJson<{ calendarUrl: string }>("/api/settings");
  return result.calendarUrl;
}

export async function searchLocations(
  query: string,
  signal: AbortSignal,
): Promise<LessonLocation[]> {
  const result = await requestJson<{ locations: LessonLocation[] }>("/api/locations", {
    method: "POST",
    body: JSON.stringify({ query }),
    signal,
  });
  return result.locations;
}

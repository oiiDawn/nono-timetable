import type { LessonRule } from "@/types/lesson";

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
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : "请求失败，请稍后重试";
    throw new ApiError(response.status, message);
  }
  return body as T;
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

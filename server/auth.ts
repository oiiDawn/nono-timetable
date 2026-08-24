import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { RequestError } from "./http.js";

const COOKIE_NAME = "nono_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string): string {
  const secret = requireEnv("SESSION_SECRET");
  if (Buffer.byteLength(secret) < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPassword(password: string): boolean {
  const [algorithm, salt, expected] = requireEnv("APP_PASSWORD_HASH").split("$");
  if (algorithm !== "scrypt" || !salt || !expected) {
    throw new Error("APP_PASSWORD_HASH must use scrypt$salt$hash format");
  }
  const actual = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(actual, expected);
}

export function createSessionCookie(request: Request): string {
  const payload = encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const token = `${payload}.${sign(payload)}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function isAuthenticated(request: Request): boolean {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof session.exp === "number" && session.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function requireAuth(request: Request): void {
  if (!isAuthenticated(request)) {
    throw new RequestError(401, "登录已失效，请重新登录");
  }
}

export function calendarFeedToken(): string {
  const token = requireEnv("CALENDAR_FEED_TOKEN");
  if (Buffer.byteLength(token) < 32) {
    throw new Error("CALENDAR_FEED_TOKEN must be at least 32 bytes");
  }
  return token;
}

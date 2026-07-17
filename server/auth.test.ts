import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionCookie,
  isAuthenticated,
  verifyPassword,
} from "./auth";

const originalEnv = { ...process.env };

beforeEach(() => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync("correct horse", salt, 64).toString("hex");
  process.env.APP_PASSWORD_HASH = `scrypt$${salt}$${hash}`;
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("authentication", () => {
  it("verifies only the configured password", () => {
    expect(verifyPassword("correct horse")).toBe(true);
    expect(verifyPassword("wrong password")).toBe(false);
  });

  it("creates a signed session cookie accepted on later requests", () => {
    const loginRequest = new Request("https://example.com/api/auth/login");
    const cookie = createSessionCookie(loginRequest).split(";")[0];
    const authenticatedRequest = new Request("https://example.com/api/lessons", {
      headers: { Cookie: cookie },
    });

    expect(cookie).toContain("nono_session=");
    expect(createSessionCookie(loginRequest)).toContain("; Secure;");
    expect(isAuthenticated(authenticatedRequest)).toBe(true);
  });

  it("rejects a tampered session", () => {
    const request = new Request("https://example.com/api/lessons", {
      headers: { Cookie: "nono_session=invalid.invalid" },
    });
    expect(isAuthenticated(request)).toBe(false);
  });
});

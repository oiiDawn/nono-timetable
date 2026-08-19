/** Classname join and browser ids. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function createId(): string {
  return crypto.randomUUID();
}

/** Verify agent edit scopes, input validation and snapshot-bound confirmation. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allOccurrences,
  confirmationToken,
  createSchema,
  deleteSchema,
  planMutation,
  updateSchema,
  validConfirmation,
  type Mutation,
} from "./mcp-lessons";
import type { LessonRule } from "../src/types/lesson";

const rule: LessonRule = {
  id: "series",
  version: 1,
  title: "小明",
  startDate: "2026-10-08",
  startTime: "09:00",
  endTime: "10:00",
  notes: "",
  location: null,
  repeat: { freq: "daily", interval: 1, endType: "count", endCount: 4 },
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const target = { id: rule.id, version: 1, originalDate: "2026-10-09", scope: "this" as const };
afterEach(() => vi.unstubAllEnvs());

describe("agent recurrence edits", () => {
  it("counts widely spaced weekly recurrences without silently truncating the preview", () => {
    const spaced = {
      ...rule,
      repeat: { freq: "weekly" as const, interval: 100, endType: "count" as const, endCount: 300 },
    };
    expect(allOccurrences([spaced])).toHaveLength(300);
    expect(
      planMutation(
        { kind: "delete", input: { ...target, originalDate: rule.startDate, scope: "all" } },
        [spaced],
      ).affectedCount,
    ).toBe(300);
  });
  it("changes one moved occurrence and preserves the series and inherited location", () => {
    const plan = planMutation(
      { kind: "update", input: { ...target, changes: { startDate: "2026-10-13", notes: "改期" } } },
      [rule],
    );
    expect(allOccurrences(plan.replacements).map((i) => [i.originalDate, i.date])).toContainEqual([
      "2026-10-09",
      "2026-10-13",
    ]);
    expect(plan.replacements[0].startDate).toBe(rule.startDate);
    expect(
      plan.replacements[0].repeat?.exceptions?.[target.originalDate]?.location,
    ).toBeUndefined();
  });
  it("splits future occurrences and keeps only the remaining count", () => {
    const plan = planMutation(
      {
        kind: "update",
        input: { ...target, scope: "future", changes: { startTime: "11:00", endTime: "12:00" } },
      },
      [rule],
    );
    expect(plan.replacements.map((r) => r.repeat?.endCount)).toEqual([1, 3]);
    expect(allOccurrences(plan.replacements)).toHaveLength(4);
    expect(plan.replacements[0].startTime).toBe("09:00");
  });
  it("requires confirmation before dropping single-occurrence adjustments", () => {
    const adjusted = {
      ...rule,
      repeat: {
        ...rule.repeat!,
        exceptions: { "2026-10-11": { date: "2026-10-12", startTime: "10:00", endTime: "11:00" } },
      },
    };
    const plan = planMutation(
      { kind: "update", input: { ...target, scope: "all", changes: { repeat: null } } },
      [adjusted],
    );
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.lostAdjustments).toEqual(["2026-10-11"]);
  });
  it("reconciles exceptions after moving the first series date", () => {
    const adjusted = {
      ...rule,
      repeat: {
        ...rule.repeat!,
        exceptions: { "2026-10-08": { date: "2026-10-08", startTime: "10:00", endTime: "11:00" } },
      },
    };
    const plan = planMutation(
      {
        kind: "update",
        input: {
          ...target,
          originalDate: rule.startDate,
          scope: "all",
          changes: { startDate: "2026-10-09" },
        },
      },
      [adjusted],
    );
    expect(plan.lostAdjustments).toEqual(["2026-10-08"]);
    expect(plan.replacements[0].startDate).toBe("2026-10-09");
  });
  it.each(["all", "future"] as const)(
    "previews %s deletion with the actual undeleted count",
    (scope) => {
      const excluded = { ...rule, repeat: { ...rule.repeat!, excludedDates: ["2026-10-10"] } };
      const plan = planMutation({ kind: "delete", input: { ...target, scope } }, [excluded]);
      expect(plan.requiresConfirmation).toBe(true);
      expect(plan.affectedCount).toBe(scope === "all" ? 3 : 2);
    },
  );
  it("deletes one occurrence directly, while future deletion at the first date removes the rule", () => {
    const one = planMutation({ kind: "delete", input: target }, [rule]);
    expect(one.requiresConfirmation).toBe(false);
    expect(allOccurrences(one.replacements)).toHaveLength(3);
    const future = planMutation(
      { kind: "delete", input: { ...target, originalDate: rule.startDate, scope: "future" } },
      [rule],
    );
    expect(future.replacements).toEqual([]);
    expect(future.requiresConfirmation).toBe(true);
  });
  it("detects collisions with another occurrence in the same series", () => {
    const plan = planMutation(
      { kind: "update", input: { ...target, changes: { startDate: "2026-10-10" } } },
      [rule],
    );
    expect(plan.conflicts).toHaveLength(1);
  });
  it("does not treat adjacent lessons as conflicting", () => {
    const other = { ...rule, id: "other", startTime: "10:00", endTime: "11:00" };
    const plan = planMutation(
      { kind: "update", input: { ...target, changes: { notes: "备注" } } },
      [rule, other],
    );
    expect(plan.conflicts).toEqual([]);
  });
  it("checks every new occurrence when converting a single lesson into a series", () => {
    const single = { ...rule, repeat: null };
    const other = { ...single, id: "other", startDate: "2026-10-10" };
    const plan = planMutation(
      {
        kind: "update",
        input: { ...target, originalDate: rule.startDate, changes: { repeat: rule.repeat } },
      },
      [single, other],
    );
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].instance.date).toBe("2026-10-10");
  });
  it("rejects stale versions, absent occurrences, and implicit delete scope", () => {
    expect(() =>
      planMutation({ kind: "delete", input: { ...target, version: 2 } }, [rule]),
    ).toThrow("课程已变化");
    expect(() =>
      planMutation({ kind: "delete", input: { ...target, originalDate: "2026-10-20" } }, [rule]),
    ).toThrow("课次不存在");
    expect(
      deleteSchema.safeParse({ id: "series", version: 1, originalDate: rule.startDate }).success,
    ).toBe(false);
  });
  it("rejects bad times and attempts to smuggle recurrence exceptions", () => {
    expect(() =>
      planMutation({ kind: "update", input: { ...target, changes: { startTime: "07:00" } } }, [
        rule,
      ]),
    ).toThrow("08:00");
    expect(
      updateSchema.safeParse({
        ...target,
        changes: { repeat: { ...rule.repeat, excludedDates: [rule.startDate] } },
      }).success,
    ).toBe(false);
    expect(createSchema.safeParse({ requestId: "bad", lesson: rule }).success).toBe(false);
  });
  it("binds confirmation to all timetable versions, the exact operation and the grant", () => {
    vi.stubEnv("SESSION_SECRET", "s".repeat(32));
    const mutation: Mutation = { kind: "delete", input: { ...target, scope: "all" } };
    const token = confirmationToken(mutation, [rule], "grant");
    expect(validConfirmation(token, mutation, [rule], "grant")).toBe(true);
    expect(validConfirmation(token, mutation, [rule], "other")).toBe(false);
    expect(validConfirmation(token, mutation, [{ ...rule, version: 2 }], "grant")).toBe(false);
    expect(validConfirmation(token, { kind: "delete", input: target }, [rule], "grant")).toBe(
      false,
    );
    expect(
      validConfirmation(
        confirmationToken(mutation, [rule], "grant", Date.now() - 1),
        mutation,
        [rule],
        "grant",
      ),
    ).toBe(false);
  });
});

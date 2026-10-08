/** Plan agent edits with shared recurrence semantics and snapshot-bound confirmation. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  applyAllEventsEdit,
  applyOccurrenceEdit,
  excludeOccurrence,
  isFirstGeneratedOccurrence,
  listGeneratedOccurrenceDates,
  remainingOccurrenceCount,
  splitSeries,
  truncateRuleBefore,
} from "../src/lib/repeat.js";
import { expandRulesForRange, findConflicts, ruleToFormValues } from "../src/lib/schedule.js";
import { parseDate } from "../src/lib/dates.js";
import type { LessonRule } from "../src/types/lesson.js";
import { parseLessonRule } from "./validation.js";
import { RequestError } from "./http.js";

export const dateSchema = z.iso.date();
const locationSchema = z
  .object({
    name: z.string(),
    address: z.string(),
    detail: z.string(),
    poiId: z.string().optional(),
    longitude: z.number().optional(),
    latitude: z.number().optional(),
  })
  .strict()
  .nullable();
const repeatSchema = z
  .object({
    freq: z.enum(["daily", "weekly"]),
    interval: z.number().int().min(1).max(36500),
    byWeekdays: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).optional(),
    endType: z.enum(["count", "date"]),
    endCount: z.number().int().min(1).max(10000).optional(),
    endDate: dateSchema.optional(),
  })
  .strict()
  .nullable();
const lessonFields = {
  title: z.string().min(1).max(200),
  startDate: dateSchema,
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(10000),
  location: locationSchema,
  repeat: repeatSchema,
};
export const createSchema = z
  .object({
    requestId: z
      .string()
      .uuid()
      .describe("Generate once per intended creation; reuse on retries to avoid duplicates."),
    lesson: z
      .object({
        ...lessonFields,
        notes: lessonFields.notes.default(""),
        location: locationSchema.default(null),
        repeat: repeatSchema.default(null),
      })
      .strict(),
    confirmation: z.string().max(2000).optional(),
  })
  .strict();
const targetFields = {
  id: z.string().min(1).max(200),
  version: z.number().int().positive(),
  originalDate: dateSchema.describe("Original occurrence date from list_lessons, even if moved."),
  scope: z.enum(["this", "future", "all"]),
  confirmation: z.string().max(2000).optional(),
};
export const updateSchema = z
  .object({
    ...targetFields,
    changes: z
      .object(lessonFields)
      .partial()
      .strict()
      .refine((v) => Object.keys(v).length > 0, "Supply a change"),
    locationAction: z.enum(["set", "inherit"]).optional(),
  })
  .strict();
export const deleteSchema = z.object(targetFields).strict();
export type Mutation =
  | { kind: "create"; input: z.infer<typeof createSchema> }
  | { kind: "update"; input: z.infer<typeof updateSchema> }
  | { kind: "delete"; input: z.infer<typeof deleteSchema> };

export function lessonSnapshot(rules: LessonRule[]) {
  return Object.fromEntries(
    [...rules].sort((a, b) => a.id.localeCompare(b.id)).map((rule) => [rule.id, rule.version]),
  );
}

export function allOccurrences(rules: LessonRule[]) {
  for (const rule of rules) {
    const dates = listGeneratedOccurrenceDates(rule, 10001);
    if (dates.length > 10000 || dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new RequestError(
        400,
        "课程超出完整预览范围：最多 10000 个课次，日期不得超出 9999 年。",
      );
    }
  }
  return expandRulesForRange(rules, parseDate("0100-01-01"), parseDate("9999-12-31"));
}

export function planMutation(mutation: Mutation, rules: LessonRule[]) {
  let replacements: LessonRule[] = [];
  let removedId: string | null = null;
  let lostAdjustments: string[] = [];
  let affectedCount = 0;
  const { input } = mutation;
  if (mutation.kind === "create") {
    if (rules.some((rule) => rule.id === mutation.input.requestId))
      throw new RequestError(409, "该 requestId 已存在，请查询课表核实结果，不要重新创建。");
    replacements = [
      parseLessonRule({ ...mutation.input.lesson, id: mutation.input.requestId, version: 0 }),
    ];
    affectedCount = allOccurrences(replacements).length;
  } else {
    const { id, version, originalDate, scope } = mutation.input;
    const current = rules.find((rule) => rule.id === id);
    if (!current || current.version !== version)
      throw new RequestError(409, "课程已变化，请重新查询、预览并确认。");
    const instances = allOccurrences([current]);
    const selected = instances.find((instance) => instance.originalDate === originalDate);
    if (!selected)
      throw new RequestError(400, "课次不存在或已删除，请使用查询结果中的 originalDate。");
    removedId = id;
    affectedCount = instances.filter(
      (instance) =>
        scope === "all" ||
        (scope === "this"
          ? instance.originalDate === originalDate
          : instance.originalDate >= originalDate),
    ).length;
    if (mutation.kind === "delete") {
      if (current.repeat && scope === "this")
        replacements = [excludeOccurrence(current, originalDate)];
      if (current.repeat && scope === "future") {
        const previous = truncateRuleBefore(current, originalDate);
        if (previous) replacements = [previous];
      }
    } else {
      const { changes, locationAction } = mutation.input;
      if (scope === "this" && current.repeat && changes.repeat !== undefined)
        throw new RequestError(400, "单次修改不能改变重复规则。");
      if (locationAction === "set" && changes.location === undefined)
        throw new RequestError(400, "设置地点必须提供 location，可传 null 清空。");
      if (locationAction === "inherit" && changes.location !== undefined)
        throw new RequestError(400, "恢复系列地点时不要同时指定 location。");
      const action = locationAction ?? (changes.location !== undefined ? "set" : undefined);
      const base =
        scope === "all" ? current : { ...current, ...selected, startDate: selected.date };
      const repeat = changes.repeat === undefined ? current.repeat : changes.repeat;
      const draft = parseLessonRule({
        ...base,
        ...changes,
        repeat: repeat ? { ...repeat, exceptions: undefined, excludedDates: undefined } : null,
      });
      if (scope === "this" && current.repeat) {
        replacements = [
          applyOccurrenceEdit(current, originalDate, {
            ...ruleToFormValues(draft),
            locationAction: action,
          }),
        ];
      } else if (
        scope === "future" &&
        current.repeat &&
        !isFirstGeneratedOccurrence(current, originalDate)
      ) {
        if (changes.repeat === undefined && draft.repeat?.endType === "count")
          draft.repeat.endCount = remainingOccurrenceCount(current, originalDate);
        const nextId = `mcp-${current.id}-${version}-${originalDate}`;
        if (rules.some((rule) => rule.id === nextId))
          throw new RequestError(409, "拆分后的课程 ID 已存在，请重新查询。");
        const result = splitSeries(
          current,
          originalDate,
          { ...draft, id: nextId, version: 0 },
          action,
        );
        replacements = [result.previous, result.next];
      } else if (current.repeat) {
        if (
          scope === "all" &&
          !isFirstGeneratedOccurrence(current, originalDate) &&
          changes.startDate !== undefined &&
          changes.startDate !== current.startDate
        )
          throw new RequestError(400, "修改整个系列的开始日期时，请指定系列第一个 originalDate。");
        replacements = [
          applyAllEventsEdit(current, { ...draft, locationAction: action }, originalDate).rule,
        ];
      } else replacements = [draft];
      const previousAdjustments = [
        ...Object.keys(current.repeat?.exceptions ?? {}),
        ...(current.repeat?.excludedDates ?? []),
      ];
      const retained = new Set(
        replacements.flatMap((rule) => [
          ...Object.keys(rule.repeat?.exceptions ?? {}),
          ...(rule.repeat?.excludedDates ?? []),
        ]),
      );
      lostAdjustments = previousAdjustments.filter(
        (date) => !retained.has(date) && scope !== "this",
      );
    }
  }
  replacements = replacements.map((rule) => parseLessonRule(rule));
  const resultingRules = [...rules.filter((rule) => rule.id !== removedId), ...replacements];
  const allInstances = allOccurrences(resultingRules);
  const byDate = new Map<string, typeof allInstances>();
  for (const instance of allInstances) {
    const day = byDate.get(instance.date) ?? [];
    day.push(instance);
    byDate.set(instance.date, day);
  }
  const singleOccurrence =
    mutation.kind === "update" &&
    mutation.input.scope === "this" &&
    Boolean(rules.find((rule) => rule.id === mutation.input.id)?.repeat);
  const candidates =
    mutation.kind === "delete"
      ? []
      : allOccurrences(replacements).filter(
          (instance) => !singleOccurrence || instance.originalDate === mutation.input.originalDate,
        );
  const conflicts = candidates.flatMap((instance) => {
    const conflict = findConflicts(instance, byDate.get(instance.date) ?? []);
    return conflict ? [conflict] : [];
  });
  const bulkDelete =
    mutation.kind === "delete" &&
    mutation.input.scope !== "this" &&
    Boolean(rules.find((rule) => rule.id === mutation.input.id)?.repeat);
  return {
    replacements,
    removedId,
    affectedCount,
    lostAdjustments,
    conflicts,
    requiresConfirmation: bulkDelete || lostAdjustments.length > 0 || conflicts.length > 0,
    confirmation: input.confirmation,
  };
}

function confirmationSignature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Invalid SESSION_SECRET");
  return createHmac("sha256", secret).update(`mcp-confirmation:${payload}`).digest("base64url");
}

/** Bind confirmation to the exact request, grant and full timetable snapshot. */
export function confirmationToken(
  mutation: Mutation,
  rules: LessonRule[],
  grantId: string,
  expires = Date.now() + 10 * 60_000,
) {
  const { confirmation: _confirmation, ...input } = mutation.input;
  const digest = confirmationSignature(
    JSON.stringify({ kind: mutation.kind, input, snapshot: lessonSnapshot(rules), grantId }),
  );
  const payload = `${expires}.${digest}`;
  return `${payload}.${confirmationSignature(payload)}`;
}

export function validConfirmation(
  token: string | undefined,
  mutation: Mutation,
  rules: LessonRule[],
  grantId: string,
) {
  if (!token) return false;
  const expires = Number(token.split(".")[0]);
  if (!Number.isSafeInteger(expires) || expires < Date.now()) return false;
  const expected = Buffer.from(confirmationToken(mutation, rules, grantId, expires));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Timetable shell: calendar views, lesson editor, and recurrence save/delete scope. */

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarToolbar } from "@/components/CalendarToolbar";
import { LessonForm } from "@/components/LessonForm";
import { MonthView } from "@/components/MonthView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WeekView } from "@/components/WeekView";
import { addDays, formatDate, parseDate, startOfMonth } from "@/lib/dates";
import {
  ApiError,
  createLesson,
  fetchLessons,
  getCalendarUrl,
  getSession,
  login,
  logout,
  removeLesson,
  splitLesson,
  updateLesson,
} from "@/lib/api";
import {
  DEFAULT_REPEAT_COUNT,
  applyAllEventsEdit,
  excludeOccurrence,
  hasRepeatRuleChanged,
  isFirstGeneratedOccurrence,
  remainingOccurrenceCount,
  setOccurrenceException,
  splitSeries,
  truncateRuleBefore,
  weekdayFromDate,
} from "@/lib/repeat";
import {
  expandRulesForRange,
  findConflicts,
  findConflictsForRule,
  formValuesToRule,
  formatMonthLabel,
  formatWeekLabel,
  getMonthGridRange,
  getWeekStart,
  loadStoredViewMode,
  ruleToFormValues,
  shiftMonthStart,
  storeViewMode,
  validateFormValues,
  type CalendarViewMode,
} from "@/lib/schedule";
import { createId } from "@/lib/utils";
import type {
  ConflictInfo,
  LessonFormValues,
  LessonInstance,
  LessonRule,
} from "@/types/lesson";

type RecurrenceScope = "this" | "future" | "all";

function createDefaultFormValues(date?: string): LessonFormValues {
  const startDate = date ?? formatDate(new Date());
  return {
    title: "",
    startDate,
    startTime: "09:00",
    endTime: "11:00",
    notes: "",
    repeatPreset: "none",
    freq: "weekly",
    interval: 1,
    byWeekdays: [weekdayFromDate(startDate)],
    endType: "count",
    endCount: DEFAULT_REPEAT_COUNT,
    endDate: startDate,
  };
}

function sortRules(rules: LessonRule[]): LessonRule[] {
  return [...rules].sort((a, b) =>
    `${a.startDate}-${a.startTime}`.localeCompare(`${b.startDate}-${b.startTime}`),
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rules, setRules] = useState<LessonRule[]>([]);
  const loadingRef = useRef(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => loadStoredViewMode());
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    formatDate(new Date()),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] = useState<LessonInstance | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<LessonFormValues>(() =>
    createDefaultFormValues(),
  );
  const [formValues, setFormValues] = useState<LessonFormValues>(() =>
    createDefaultFormValues(),
  );
  const [pendingConflicts, setPendingConflicts] = useState<ConflictInfo[]>([]);
  const [pendingSave, setPendingSave] = useState<LessonFormValues | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const monthRange = getMonthGridRange(monthStart);
  const weekInstances = useMemo(
    () => expandRulesForRange(rules, weekStart, weekEnd),
    [rules, weekStart, weekEnd],
  );
  const monthInstances = useMemo(
    () => expandRulesForRange(rules, monthRange.start, monthRange.end),
    [rules, monthRange.end, monthRange.start],
  );
  const calendarTitle =
    viewMode === "month" ? formatMonthLabel(monthStart) : formatWeekLabel(weekStart);
  const editingRule = rules.find((rule) => rule.id === editingRuleId);
  const originalDate = editingInstance?.originalDate ?? editingRule?.startDate ?? "";
  const thisEventDisabled = pendingSave ? hasRepeatRuleChanged(initialFormValues, pendingSave) : false;

  const handleApiError = async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setAuthenticated(false);
      setRules([]);
      return;
    }
    window.alert(error instanceof Error ? error.message : "操作失败，请重试。");
  };

  const loadCloudLessons = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      setRules(await fetchLessons());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
        setRules([]);
      } else {
        setLoadError(error instanceof Error ? error.message : "课表加载失败");
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    void getSession()
      .then(setAuthenticated)
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (authenticated) void loadCloudLessons();
  }, [authenticated]);

  const openCreateForm = (date: string, startTime = "09:00", endTime = "11:00") => {
    const values = { ...createDefaultFormValues(date), startTime, endTime };
    setFormMode("create");
    setEditingRuleId(null);
    setEditingInstance(null);
    setInitialFormValues(values);
    setFormValues(values);
    setPendingConflicts([]);
    setFormOpen(true);
  };

  const openEditForm = (instance: LessonInstance) => {
    const rule = rules.find((item) => item.id === instance.ruleId);
    if (!rule) return;
    const values = ruleToFormValues(rule, instance);
    setFormMode("edit");
    setEditingRuleId(rule.id);
    setEditingInstance(instance);
    setInitialFormValues(values);
    setFormValues(values);
    setPendingConflicts([]);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setPendingConflicts([]);
    setPendingSave(null);
    setPendingDelete(false);
  };

  const replaceRules = (nextRules: LessonRule[]) => {
    setRules(sortRules(nextRules));
  };

  const persistRule = async (nextRule: LessonRule, existing?: LessonRule) => {
    const saved = existing ? await updateLesson(nextRule) : await createLesson(nextRule);
    replaceRules([...rules.filter((rule) => rule.id !== saved.id), saved]);
    setSelectedDate(nextRule.startDate);
    closeForm();
  };

  const checkConflicts = (nextRule: LessonRule, focusDate?: string): boolean => {
    const otherRules = rules.filter((rule) => rule.id !== nextRule.id);
    if (focusDate) {
      const day = parseDate(focusDate);
      const candidate = expandRulesForRange([nextRule], day, day).find(
        (item) => item.originalDate === (editingInstance?.originalDate ?? focusDate),
      ) ?? expandRulesForRange([nextRule], day, day)[0];
      const conflict = candidate
        ? findConflicts(candidate, expandRulesForRange([...otherRules, nextRule], day, day))
        : null;
      if (conflict && pendingConflicts.length === 0) {
        setPendingConflicts([conflict]);
        return false;
      }
      return true;
    }
    const conflictRangeStart = getWeekStart(parseDate(nextRule.startDate));
    const conflictRangeEnd = addDays(conflictRangeStart, 365 * 2);
    const conflicts = findConflictsForRule(
      nextRule,
      [...otherRules, nextRule],
      conflictRangeStart,
      conflictRangeEnd,
    );
    if (conflicts.length > 0 && pendingConflicts.length === 0) {
      setPendingConflicts(conflicts);
      return false;
    }
    return true;
  };

  const confirmInvalidExceptions = (invalidDates: string[]): boolean => {
    if (invalidDates.length === 0) return true;
    return window.confirm(
      `修改循环规则将移除 ${invalidDates.length} 条已失效的单次调整，确定继续吗？`,
    );
  };

  const saveThisEvent = async (values: LessonFormValues, rule: LessonRule) => {
    if (!editingInstance) return;
    const nextRule = setOccurrenceException(rule, editingInstance.originalDate, {
      date: values.startDate,
      startTime: values.startTime,
      endTime: values.endTime,
      title: values.title.trim(),
      notes: values.notes.trim(),
    });
    if (!checkConflicts(nextRule, values.startDate)) return;
    await persistRule(nextRule, rule);
  };

  const saveAllEvents = async (values: LessonFormValues, rule: LessonRule) => {
    const drafted = formValuesToRule(values, rule);
    const { rule: nextRule, invalidDates } = rule.repeat
      ? applyAllEventsEdit(rule, drafted, originalDate)
      : { rule: drafted, invalidDates: [] };
    if (!confirmInvalidExceptions(invalidDates)) return;
    if (!checkConflicts(nextRule)) return;
    await persistRule(nextRule, rule);
  };

  const saveFutureEvents = async (values: LessonFormValues, rule: LessonRule) => {
    if (!rule.repeat || isFirstGeneratedOccurrence(rule, originalDate)) {
      await saveAllEvents(values, rule);
      return;
    }
    const drafted = formValuesToRule(values);
    if (drafted.repeat?.endType === "count" && values.endCount === initialFormValues.endCount) {
      drafted.repeat.endCount = remainingOccurrenceCount(rule, originalDate);
    }
    const { previous, next } = splitSeries(rule, originalDate, {
      ...drafted,
      id: createId(),
      version: 0,
    });
    if (!checkConflicts(next) || !checkConflicts(previous)) return;
    const saved = await splitLesson(previous, next);
    replaceRules([
      ...rules.filter((item) => item.id !== rule.id && item.id !== saved.next.id),
      saved.previous,
      saved.next,
    ]);
    setSelectedDate(values.startDate);
    closeForm();
  };

  const handleSubmit = async (values: LessonFormValues) => {
    const validationError = validateFormValues(values);
    if (validationError) {
      window.alert(validationError);
      return;
    }
    setFormValues(values);

    try {
      if (formMode === "create") {
        const nextRule = formValuesToRule(values);
        if (!checkConflicts(nextRule)) return;
        await persistRule(nextRule);
        return;
      }

      const existing = editingRuleId
        ? rules.find((rule) => rule.id === editingRuleId)
        : undefined;
      if (!existing) return;

      if (!existing.repeat) {
        const nextRule = formValuesToRule(values, existing);
        if (!checkConflicts(nextRule)) return;
        await persistRule(nextRule, existing);
        return;
      }

      setPendingConflicts([]);
      setPendingSave(values);
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const handleSaveScope = async (scope: RecurrenceScope) => {
    if (!pendingSave || !editingRule) return;
    try {
      if (scope === "this") await saveThisEvent(pendingSave, editingRule);
      else if (scope === "future") await saveFutureEvents(pendingSave, editingRule);
      else await saveAllEvents(pendingSave, editingRule);
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const handleDelete = () => {
    if (!editingRule) return;
    if (!editingRule.repeat) {
      void deleteEntireRule(editingRule);
      return;
    }
    setPendingDelete(true);
  };

  const deleteEntireRule = async (rule: LessonRule) => {
    const confirmed = window.confirm(
      rule.repeat ? "将删除整个循环课程系列，确定继续吗？" : "确定删除这节课吗？",
    );
    if (!confirmed) return;
    try {
      await removeLesson(rule);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      closeForm();
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const handleDeleteScope = async (scope: RecurrenceScope) => {
    if (!editingRule) return;
    try {
      if (scope === "all" || !editingRule.repeat) {
        await deleteEntireRule(editingRule);
        return;
      }
      if (scope === "this") {
        if (!editingInstance) return;
        const nextRule = excludeOccurrence(editingRule, editingInstance.originalDate);
        await persistRule(nextRule, editingRule);
        return;
      }
      if (isFirstGeneratedOccurrence(editingRule, originalDate)) {
        await deleteEntireRule(editingRule);
        return;
      }
      const truncated = truncateRuleBefore(editingRule, originalDate);
      if (!truncated) {
        await deleteEntireRule(editingRule);
        return;
      }
      await persistRule(truncated, editingRule);
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const syncNavigationToSelectedDate = (dateKey: string, mode: CalendarViewMode) => {
    const date = parseDate(dateKey);
    if (mode === "week") {
      setWeekStart(getWeekStart(date));
      return;
    }
    setMonthStart(startOfMonth(date));
  };

  const handleViewModeChange = (mode: CalendarViewMode) => {
    storeViewMode(mode);
    setViewMode(mode);
    if (selectedDate) {
      syncNavigationToSelectedDate(selectedDate, mode);
    }
  };

  const handlePrevious = () => {
    if (viewMode === "month") {
      setMonthStart((current) => shiftMonthStart(current, -1));
      return;
    }
    setWeekStart((current) => addDays(current, -7));
  };

  const handleNext = () => {
    if (viewMode === "month") {
      setMonthStart((current) => shiftMonthStart(current, 1));
      return;
    }
    setWeekStart((current) => addDays(current, 7));
  };

  const goToToday = () => {
    const today = new Date();
    const todayKey = formatDate(today);
    setSelectedDate(todayKey);
    if (viewMode === "month") {
      setMonthStart(startOfMonth(today));
      return;
    }
    setWeekStart(getWeekStart(today));
  };

  const copySubscriptionUrl = async () => {
    try {
      const url = await getCalendarUrl();
      await navigator.clipboard.writeText(url);
      window.alert("Apple Calendar 订阅地址已复制。");
    } catch (error) {
      await handleApiError(error);
    }
  };

  if (authenticated === null) {
    return <div className="grid h-dvh place-items-center text-sm text-muted-foreground">正在检查登录状态…</div>;
  }

  if (!authenticated) {
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-muted/30">
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/app-icon-96.png"
              alt=""
              className="size-10 rounded-xl"
              width="40"
              height="40"
            />
            <h1 className="text-2xl font-bold">排课表</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void copySubscriptionUrl()}>
              复制订阅地址
            </Button>
            <Button variant="outline" onClick={goToToday}>回到今天</Button>
            <Button
              variant="outline"
              onClick={() =>
                void logout()
                  .catch(() => undefined)
                  .finally(() => {
                    setRules([]);
                    setAuthenticated(false);
                  })
              }
            >
              退出
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col overflow-hidden px-4 py-4">
        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <CalendarToolbar
            viewMode={viewMode}
            title={calendarTitle}
            onViewModeChange={handleViewModeChange}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />

          {loadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p>{loadError}</p>
              <Button className="mt-3" variant="outline" onClick={() => void loadCloudLessons()}>
                重新加载
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">正在加载云端课表…</div>
            ) : viewMode === "month" ? (
              <MonthView
                monthStart={monthStart}
                instances={monthInstances}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onSelectLesson={openEditForm}
                onCreateOnDate={(date) => openCreateForm(date)}
              />
            ) : (
              <WeekView
                weekStart={weekStart}
                instances={weekInstances}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onSelectLesson={openEditForm}
                onCreateAtSlot={(date, startTime, endTime) => {
                  setSelectedDate(date);
                  openCreateForm(date, startTime, endTime);
                }}
              />
            )}
          </div>
        </section>
      </main>

      <LessonForm
        open={formOpen}
        title={formMode === "create" ? "新增课程" : "编辑课程"}
        initialValues={formValues}
        conflicts={pendingConflicts}
        onDelete={formMode === "edit" ? handleDelete : undefined}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setFormOpen(true);
        }}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <ScopeDialog
        open={Boolean(pendingSave)}
        title="保存循环课程"
        description="这些更改要应用到哪些课次？"
        thisDisabled={thisEventDisabled}
        onClose={() => setPendingSave(null)}
        onThis={() => void handleSaveScope("this")}
        onFuture={() => void handleSaveScope("future")}
        onAll={() => void handleSaveScope("all")}
      />

      <ScopeDialog
        open={pendingDelete}
        title="删除循环课程"
        description="要删除哪些课次？"
        thisVariant="destructive"
        onClose={() => setPendingDelete(false)}
        onThis={() => void handleDeleteScope("this")}
        onFuture={() => void handleDeleteScope("future")}
        onAll={() => void handleDeleteScope("all")}
      />
    </div>
  );
}

function ScopeDialog({
  open,
  title,
  description,
  thisDisabled,
  thisVariant = "default",
  onClose,
  onThis,
  onFuture,
  onAll,
}: {
  open: boolean;
  title: string;
  description: string;
  thisDisabled?: boolean;
  thisVariant?: "default" | "destructive";
  onClose: () => void;
  onThis: () => void;
  onFuture: () => void;
  onAll: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="grid gap-2">
          <Button disabled={thisDisabled} variant={thisVariant} onClick={onThis}>
            仅此事件
          </Button>
          <Button variant="outline" onClick={onFuture}>
            所有未来事件
          </Button>
          <Button variant="outline" onClick={onAll}>
            全部事件
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-xl border bg-background p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          setError(null);
          void login(password)
            .then(onAuthenticated)
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : "登录失败"),
            )
            .finally(() => setSubmitting(false));
        }}
      >
        <div className="flex items-center gap-4">
          <img
            src="/app-icon-96.png"
            alt=""
            className="size-16 rounded-2xl shadow-sm"
            width="64"
            height="64"
          />
          <div>
            <h1 className="text-2xl font-bold">排课表</h1>
            <p className="mt-1 text-sm text-muted-foreground">请输入个人密码继续。</p>
          </div>
        </div>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="个人密码"
          required
          autoFocus
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? "正在登录…" : "登录"}
        </Button>
      </form>
    </main>
  );
}
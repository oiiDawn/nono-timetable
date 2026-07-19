import { useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "date-fns";
import { CalendarToolbar } from "@/components/CalendarToolbar";
import { LessonForm } from "@/components/LessonForm";
import { MonthView } from "@/components/MonthView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WeekView } from "@/components/WeekView";
import {
  ApiError,
  createLesson,
  fetchLessons,
  getCalendarUrl,
  getSession,
  login,
  logout,
  removeLesson,
  updateLesson,
} from "@/lib/api";
import {
  expandRulesForRange,
  findConflictsForRule,
  formValuesToRule,
  formatDate,
  formatMonthLabel,
  formatWeekLabel,
  getMonthGridRange,
  getMonthStart,
  getWeekStart,
  loadStoredViewMode,
  parseDate,
  ruleToFormValues,
  shiftMonthStart,
  storeViewMode,
  validateFormValues,
  type CalendarViewMode,
} from "@/lib/schedule";
import type {
  ConflictInfo,
  LessonFormValues,
  LessonInstance,
  LessonRule,
} from "@/types/lesson";

type FormMode = "create" | "edit";

function createDefaultFormValues(date?: string): LessonFormValues {
  return {
    title: "",
    startDate: date ?? formatDate(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
    isRepeating: false,
    intervalDays: 1,
    endType: "count",
    endCount: 10,
    endDate: date ?? formatDate(new Date()),
  };
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rules, setRules] = useState<LessonRule[]>([]);
  const loadingRef = useRef(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => loadStoredViewMode());
  const [monthStart, setMonthStart] = useState(() => getMonthStart(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    formatDate(new Date()),
  );
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<LessonFormValues>(() =>
    createDefaultFormValues(),
  );
  const [pendingConflicts, setPendingConflicts] = useState<ConflictInfo[]>([]);

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

  const openCreateForm = (date: string, startTime = "09:00", endTime = "10:00") => {
    setFormMode("create");
    setEditingRuleId(null);
    setFormValues({
      ...createDefaultFormValues(date),
      startTime,
      endTime,
    });
    setPendingConflicts([]);
    setFormOpen(true);
  };

  const openEditForm = (instance: LessonInstance) => {
    const rule = rules.find((item) => item.id === instance.ruleId);
    if (!rule) {
      return;
    }

    setFormMode("edit");
    setEditingRuleId(rule.id);
    setFormValues(ruleToFormValues(rule));
    setPendingConflicts([]);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!editingRuleId) {
      return;
    }

    const confirmed = window.confirm(
      formValues.isRepeating
        ? "将删除整个循环课程系列，确定继续吗？"
        : "确定删除这节课吗？",
    );
    if (!confirmed) {
      return;
    }

    const rule = rules.find((item) => item.id === editingRuleId);
    if (!rule) return;
    try {
      await removeLesson(rule);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setPendingConflicts([]);
      setFormOpen(false);
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const handleSubmit = async (values: LessonFormValues) => {
    const validationError = validateFormValues(values);
    if (validationError) {
      window.alert(validationError);
      return;
    }

    try {
      const existing = editingRuleId
        ? rules.find((rule) => rule.id === editingRuleId)
        : undefined;
      const nextRule = formValuesToRule(values, existing);
      const otherRules = rules.filter((rule) => rule.id !== nextRule.id);

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
        return;
      }

      const savedRule = existing
        ? await updateLesson(nextRule)
        : await createLesson(nextRule);
      setRules((current) => {
        const remaining = current.filter((rule) => rule.id !== savedRule.id);
        return [...remaining, savedRule].sort((a, b) =>
          `${a.startDate}-${a.startTime}`.localeCompare(`${b.startDate}-${b.startTime}`),
        );
      });
      setPendingConflicts([]);
      setFormOpen(false);
      setSelectedDate(nextRule.startDate);
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
    setMonthStart(getMonthStart(date));
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
      setMonthStart(getMonthStart(today));
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
        title={formMode === "create" ? "新增课程" : "编辑课程系列"}
        initialValues={formValues}
        conflicts={pendingConflicts}
        onDelete={formMode === "edit" ? handleDelete : undefined}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setPendingConflicts([]);
          }
        }}
        onSubmit={handleSubmit}
      />
    </div>
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

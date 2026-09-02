/** Timetable shell: calendar views, lesson editor, and recurrence save/delete scope. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  toast,
} from "@heroui/react";
import { AppBar } from "@/components/AppBar";
import { CalendarToolbar } from "@/components/CalendarToolbar";
import { LessonForm } from "@/components/LessonForm";
import { MobileDayView, MobileMonthView } from "@/components/MobileCalendar";
import { MonthView } from "@/components/MonthView";
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
  filterRulesByTitle,
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
  type CalendarViewMode,
} from "@/lib/schedule";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { createId } from "@/lib/utils";
import type { ConflictInfo, LessonFormValues, LessonInstance, LessonRule } from "@/types/lesson";

type RecurrenceScope = "this" | "future" | "all";

interface ConfirmRequest {
  title: string;
  description: string;
  action: () => void;
}

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
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rules, setRules] = useState<LessonRule[]>([]);
  const [titleFilter, setTitleFilter] = useState("");
  const loadingRef = useRef(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => loadStoredViewMode());
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => formatDate(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] = useState<LessonInstance | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<LessonFormValues>(() =>
    createDefaultFormValues(),
  );
  const [formValues, setFormValues] = useState<LessonFormValues>(() => createDefaultFormValues());
  const [pendingConflicts, setPendingConflicts] = useState<ConflictInfo[]>([]);
  const [pendingSave, setPendingSave] = useState<LessonFormValues | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const weekEnd = addDays(weekStart, 6);
  const monthRange = getMonthGridRange(monthStart);
  const visibleRules = useMemo(() => filterRulesByTitle(rules, titleFilter), [rules, titleFilter]);

  const weekInstances = useMemo(
    () => expandRulesForRange(visibleRules, weekStart, weekEnd),
    [visibleRules, weekStart, weekEnd],
  );
  const monthInstances = useMemo(
    () => expandRulesForRange(visibleRules, monthRange.start, monthRange.end),
    [visibleRules, monthRange.end, monthRange.start],
  );
  const calendarTitle =
    viewMode === "month" ? formatMonthLabel(monthStart) : formatWeekLabel(weekStart);
  const editingRule = rules.find((rule) => rule.id === editingRuleId);
  const originalDate = editingInstance?.originalDate ?? editingRule?.startDate ?? "";
  const thisEventDisabled = pendingSave
    ? hasRepeatRuleChanged(initialFormValues, pendingSave)
    : false;

  const handleApiError = async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setAuthenticated(false);
      setRules([]);
      return;
    }
    toast.danger(error instanceof Error ? error.message : "操作失败，请重试。");
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
      const candidate =
        expandRulesForRange([nextRule], day, day).find(
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

  const requestConfirm = (title: string, description: string, action: () => void) => {
    setConfirmRequest({ title, description, action });
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
    const proceed = async () => {
      if (!checkConflicts(nextRule)) return;
      await persistRule(nextRule, rule);
    };
    if (invalidDates.length > 0) {
      requestConfirm(
        "移除失效调整",
        `修改循环规则将移除 ${invalidDates.length} 条已失效的单次调整，确定继续吗？`,
        () => void proceed(),
      );
      return;
    }
    await proceed();
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
    setFormValues(values);

    try {
      if (formMode === "create") {
        const nextRule = formValuesToRule(values);
        if (!checkConflicts(nextRule)) return;
        await persistRule(nextRule);
        return;
      }

      const existing = editingRuleId ? rules.find((rule) => rule.id === editingRuleId) : undefined;
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

  const performDeleteRule = async (rule: LessonRule) => {
    try {
      await removeLesson(rule);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      closeForm();
    } catch (error) {
      await handleApiError(error);
      if (error instanceof ApiError && error.status === 409) void loadCloudLessons();
    }
  };

  const deleteEntireRule = (rule: LessonRule) => {
    requestConfirm(
      rule.repeat ? "删除循环课程" : "删除课程",
      rule.repeat ? "将删除整个循环课程系列，确定继续吗？" : "确定删除这节课吗？",
      () => void performDeleteRule(rule),
    );
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

  const handleLogout = () => {
    void logout()
      .catch(() => undefined)
      .finally(() => {
        setRules([]);
        setAuthenticated(false);
      });
  };

  const copySubscriptionUrl = async () => {
    try {
      const url = await getCalendarUrl();
      await navigator.clipboard.writeText(url);
      toast.success("Apple Calendar 订阅地址已复制。");
    } catch (error) {
      await handleApiError(error);
    }
  };

  if (authenticated === null) {
    return (
      <div className="grid h-dvh place-items-center">
        <LoadingState label="正在检查登录状态…" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div
      className={
        isMobile
          ? "flex min-h-dvh flex-col bg-background"
          : "flex h-dvh flex-col overflow-hidden bg-background"
      }
    >
      <AppBar
        onCopySubscription={() => void copySubscriptionUrl()}
        onGoToday={goToToday}
        onLogout={handleLogout}
      />

      <main
        className={
          isMobile
            ? "mx-auto w-full max-w-7xl flex-1 px-3 py-3"
            : "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-4"
        }
      >
        <section
          className={
            isMobile ? "flex flex-col gap-3" : "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          }
        >
          <CalendarToolbar
            viewMode={viewMode}
            title={calendarTitle}
            titleFilter={titleFilter}
            onViewModeChange={handleViewModeChange}
            onTitleFilterChange={setTitleFilter}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />

          {loadError ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{loadError}</Alert.Title>
                <Alert.Description>
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onPress={() => void loadCloudLessons()}
                  >
                    重新加载
                  </Button>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          {isMobile ? (
            loading ? (
              <div className="grid place-items-center py-16">
                <LoadingState label="正在加载云端课表…" />
              </div>
            ) : viewMode === "month" ? (
              <MobileMonthView
                monthStart={monthStart}
                instances={monthInstances}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                onSelectLesson={openEditForm}
                onCreateOnDate={(date) => openCreateForm(date)}
              />
            ) : (
              <MobileDayView
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
            )
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              {loading ? (
                <div className="grid h-full place-items-center">
                  <LoadingState label="正在加载云端课表…" />
                </div>
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
          )}
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
        thisVariant="danger"
        onClose={() => setPendingDelete(false)}
        onThis={() => void handleDeleteScope("this")}
        onFuture={() => void handleDeleteScope("future")}
        onAll={() => void handleDeleteScope("all")}
      />

      <Modal>
        <Modal.Backdrop
          isOpen={Boolean(confirmRequest)}
          onOpenChange={(next) => {
            if (!next) setConfirmRequest(null);
          }}
        >
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{confirmRequest?.title}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-sm text-muted">{confirmRequest?.description}</p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={() => setConfirmRequest(null)}>
                  取消
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    const request = confirmRequest;
                    setConfirmRequest(null);
                    request?.action();
                  }}
                >
                  确定
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Spinner color="current" size="sm" />
      {label}
    </div>
  );
}

function ScopeDialog({
  open,
  title,
  description,
  thisDisabled,
  thisVariant = "primary",
  onClose,
  onThis,
  onFuture,
  onAll,
}: {
  open: boolean;
  title: string;
  description: string;
  thisDisabled?: boolean;
  thisVariant?: "primary" | "danger";
  onClose: () => void;
  onThis: () => void;
  onFuture: () => void;
  onAll: () => void;
}) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <Modal.Container placement={isMobile ? "bottom" : "center"} size="sm">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">{description}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button isDisabled={thisDisabled} variant={thisVariant} onPress={onThis}>
                仅此事件
              </Button>
              <Button variant="secondary" onPress={onFuture}>
                所有未来事件
              </Button>
              <Button variant="secondary" onPress={onAll}>
                全部事件
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <Card.Header className="flex-row items-center gap-4">
          <img src="/app-icon-96.png" alt="" width="64" height="64" />
          <div className="flex flex-col gap-1">
            <Card.Title>排课表</Card.Title>
            <Card.Description>请输入个人密码继续。</Card.Description>
          </div>
        </Card.Header>
        <Form
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
          <Card.Content>
            <TextField
              isRequired
              isInvalid={Boolean(error)}
              name="password"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setError(null);
              }}
            >
              <Label className="sr-only">个人密码</Label>
              <Input autoComplete="current-password" placeholder="个人密码" autoFocus fullWidth />
              <FieldError>{error}</FieldError>
            </TextField>
          </Card.Content>
          <Card.Footer>
            <Button type="submit" fullWidth isPending={submitting}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? "正在登录…" : "登录"}
                </>
              )}
            </Button>
          </Card.Footer>
        </Form>
      </Card>
    </main>
  );
}

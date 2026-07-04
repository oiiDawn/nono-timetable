import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { addDays } from "date-fns";
import { CalendarToolbar } from "@/components/CalendarToolbar";
import { LessonForm } from "@/components/LessonForm";
import { MonthView } from "@/components/MonthView";
import { Button } from "@/components/ui/button";
import { WeekView } from "@/components/WeekView";
import {
  deleteLessonRule,
  getAllLessonRules,
  getLessonRule,
  saveLessonRule,
} from "@/lib/db";
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
import type { ConflictInfo, LessonFormValues, LessonInstance } from "@/types/lesson";

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

  const rules = useLiveQuery(() => getAllLessonRules(), []) ?? [];
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

  const openEditForm = async (instance: LessonInstance) => {
    const rule = await getLessonRule(instance.ruleId);
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

    await deleteLessonRule(editingRuleId);
    setPendingConflicts([]);
    setFormOpen(false);
  };

  const handleSubmit = async (values: LessonFormValues) => {
    const validationError = validateFormValues(values);
    if (validationError) {
      window.alert(validationError);
      return;
    }

    const existing = editingRuleId ? await getLessonRule(editingRuleId) : undefined;
    const nextRule = formValuesToRule(values, existing);
    const otherRules = rules.filter((rule) => rule.id !== nextRule.id);

    const conflictRangeStart = getWeekStart(new Date(nextRule.startDate));
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

    await saveLessonRule(nextRule);
    setPendingConflicts([]);
    setFormOpen(false);
    setSelectedDate(nextRule.startDate);
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

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-muted/30">
      <header className="shrink-0 border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-bold">排课表</h1>
          <Button variant="outline" onClick={goToToday}>
            回到今天
          </Button>
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

          <div className="min-h-0 flex-1 overflow-hidden">
            {viewMode === "month" ? (
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

/** Touch-friendly mobile calendar: single-day timeline and compact month + day list. */

import { Button } from "@heroui/react";
import { Plus } from "lucide-react";
import { RecurringMark } from "@/components/icons";
import { formatDate, isSameMonth, parseDate } from "@/lib/dates";
import {
  blockHeightPx,
  getDefaultEndTime,
  getMonthGridDays,
  getTimeFromClickOffset,
  getWeekDays,
  groupInstancesByDate,
  isToday,
  isWithinScheduleWindow,
  layoutDayInstances,
  MIN_BLOCK_HEIGHT_FOR_TIME_PX,
  nowLineTopPercent,
  SCHEDULE_BODY_HEIGHT_PX,
  SCHEDULE_HOUR_COUNT,
  SCHEDULE_HOUR_HEIGHT_PX,
  SCHEDULE_HOUR_LABELS,
  timeRangeToHeightPercent,
  timeToTopPercent,
  weekdayLabel,
} from "@/lib/schedule";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import type { LessonInstance } from "@/types/lesson";

interface MobileViewProps {
  instances: LessonInstance[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onSelectLesson: (instance: LessonInstance) => void;
}

interface MobileDayViewProps extends MobileViewProps {
  weekStart: Date;
  onCreateAtSlot: (date: string, startTime: string, endTime: string) => void;
}

/** Week mode on phones: a day-of-week strip plus the selected day's timeline. */
export function MobileDayView({
  weekStart,
  instances,
  selectedDate,
  onSelectDate,
  onSelectLesson,
  onCreateAtSlot,
}: MobileDayViewProps) {
  const weekDays = getWeekDays(weekStart);
  const grouped = groupInstancesByDate(instances);
  const now = useNow();
  const todayKey = formatDate(now);
  const weekKeys = weekDays.map(formatDate);
  const activeDate =
    selectedDate && weekKeys.includes(selectedDate)
      ? selectedDate
      : weekKeys.includes(todayKey)
        ? todayKey
        : weekKeys[0];
  const dayInstances = layoutDayInstances(grouped[activeDate] ?? []);
  const activeDay = parseDate(activeDate);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = isToday(activeDay) && isWithinScheduleWindow(nowMinutes);
  const nowTopPercent = nowLineTopPercent(nowMinutes);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day) => {
          const dateKey = formatDate(day);
          const selected = dateKey === activeDate;
          const today = isToday(day);
          return (
            <button
              key={dateKey}
              type="button"
              aria-label={`${day.getMonth() + 1}月${day.getDate()}日 ${weekdayLabel(day)}`}
              aria-pressed={selected}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 transition-colors",
                selected ? "bg-accent text-accent-foreground" : "bg-surface",
                !selected && today && "text-accent",
              )}
              onClick={() => onSelectDate(dateKey)}
            >
              <span className="text-[10px] leading-none opacity-80">
                {weekdayLabel(day).replace("周", "")}
              </span>
              <span className="text-sm leading-none font-semibold">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="flex rounded-xl border bg-surface shadow-surface">
        <div
          className="relative w-12 shrink-0 border-r"
          style={{ height: SCHEDULE_BODY_HEIGHT_PX }}
        >
          {SCHEDULE_HOUR_LABELS.map((label, index) => (
            <div
              key={label}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted"
              style={{ top: index * SCHEDULE_HOUR_HEIGHT_PX }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="relative min-w-0 flex-1"
          style={{ height: SCHEDULE_BODY_HEIGHT_PX }}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("[data-lesson-block]")) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const startTime = getTimeFromClickOffset(
              event.clientY - rect.top,
              SCHEDULE_BODY_HEIGHT_PX,
            );
            onCreateAtSlot(activeDate, startTime, getDefaultEndTime(startTime));
          }}
        >
          {Array.from({ length: SCHEDULE_HOUR_COUNT }, (_, index) => (
            <div
              key={index}
              className="pointer-events-none absolute inset-x-0 border-t border-border/60"
              style={{ top: index * SCHEDULE_HOUR_HEIGHT_PX }}
            />
          ))}

          {showNowLine ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: `${nowTopPercent}%` }}
            >
              <div className="h-2 w-2 rounded-full bg-danger" />
              <div className="h-0.5 flex-1 bg-danger" />
            </div>
          ) : null}

          {dayInstances.map(({ instance, column, columnCount }) => {
            const width = 100 / columnCount;
            const left = column * width;
            const showTime =
              blockHeightPx(instance.startTime, instance.endTime) >= MIN_BLOCK_HEIGHT_FOR_TIME_PX;
            return (
              <button
                key={`${instance.ruleId}-${instance.originalDate}`}
                type="button"
                data-lesson-block
                className="absolute z-10 overflow-hidden rounded-md border border-accent/25 bg-accent-soft px-2 py-1 text-left text-xs"
                style={{
                  top: `${timeToTopPercent(instance.startTime)}%`,
                  height: `${timeRangeToHeightPercent(instance.startTime, instance.endTime)}%`,
                  left: `calc(${left}% + 2px)`,
                  width: `calc(${width}% - 4px)`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLesson(instance);
                }}
              >
                <p className="truncate leading-tight font-medium">{instance.title}</p>
                {showTime ? (
                  <p className="truncate text-[10px] text-muted">
                    {instance.startTime} - {instance.endTime}
                  </p>
                ) : null}
                <RecurringMark instance={instance} className="mt-1 inline-flex text-muted" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface MobileMonthViewProps extends MobileViewProps {
  monthStart: Date;
  onCreateOnDate: (date: string) => void;
}

const COMPACT_WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

/** Month mode on phones: compact calendar; tapping a day only selects it. */
export function MobileMonthView({
  monthStart,
  instances,
  selectedDate,
  onSelectDate,
  onSelectLesson,
  onCreateOnDate,
}: MobileMonthViewProps) {
  const gridDays = getMonthGridDays(monthStart);
  const grouped = groupInstancesByDate(instances);
  const activeDate = selectedDate ?? formatDate(new Date());
  const activeDay = parseDate(activeDate);
  const dayInstances = grouped[activeDate] ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border bg-surface p-2 shadow-surface">
        <div className="grid grid-cols-7">
          {COMPACT_WEEKDAY_HEADERS.map((label) => (
            <div key={label} className="py-1 text-center text-[10px] text-muted">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const dateKey = formatDate(day);
            const count = (grouped[dateKey] ?? []).length;
            const selected = dateKey === activeDate;
            const today = isToday(day);
            const overflow = !isSameMonth(day, monthStart);
            return (
              <button
                key={dateKey}
                type="button"
                aria-label={`${day.getMonth() + 1}月${day.getDate()}日`}
                aria-pressed={selected}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
                  selected && "bg-accent/15",
                  overflow && "opacity-40",
                )}
                onClick={() => onSelectDate(dateKey)}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-sm",
                    today ? "bg-accent font-semibold text-accent-foreground" : "text-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                <span className="flex h-1 gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                    <span key={index} className="size-1 rounded-full bg-accent" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-surface shadow-surface">
        <p className="border-b px-4 py-3 text-sm font-semibold">
          {activeDay.getMonth() + 1}月{activeDay.getDate()}日 {weekdayLabel(activeDay)}
        </p>
        {dayInstances.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">当天没有课程。</p>
        ) : (
          dayInstances.map((instance) => (
            <button
              key={`${instance.ruleId}-${instance.originalDate}`}
              type="button"
              className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0"
              onClick={() => onSelectLesson(instance)}
            >
              <span className="w-24 shrink-0 text-xs text-muted">
                {instance.startTime} - {instance.endTime}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{instance.title}</span>
              <RecurringMark instance={instance} className="inline-flex text-muted" />
            </button>
          ))
        )}
        <div className="p-2">
          <Button fullWidth variant="secondary" onPress={() => onCreateOnDate(activeDate)}>
            <Plus className="size-4" />
            添加课程
          </Button>
        </div>
      </div>
    </div>
  );
}

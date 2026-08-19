/** Week grid of timed lesson blocks. */

import { RecurringMark } from "@/components/icons";
import { isSameDay } from "@/lib/dates";
import { useEffect, useMemo, useRef } from "react";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import type { LessonInstance } from "@/types/lesson";
import {
  blockHeightPx,
  formatDate,
  getDefaultEndTime,
  getTimeFromClickOffset,
  getWeekDays,
  groupInstancesByDate,
  isDateInWeek,
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

interface WeekViewProps {
  weekStart: Date;
  instances: LessonInstance[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onSelectLesson: (instance: LessonInstance) => void;
  onCreateAtSlot: (date: string, startTime: string, endTime: string) => void;
}

export function WeekView({
  weekStart,
  instances,
  selectedDate,
  onSelectDate,
  onSelectLesson,
  onCreateAtSlot,
}: WeekViewProps) {
  const weekDays = getWeekDays(weekStart);
  const grouped = groupInstancesByDate(instances);
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = useNow();

  const todayInWeek = useMemo(
    () => isDateInWeek(now, weekStart),
    [now, weekStart],
  );

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = todayInWeek && isWithinScheduleWindow(nowMinutes);
  const nowTopPercent = nowLineTopPercent(nowMinutes);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    if (showNowLine) {
      const topPx =
        (nowTopPercent / 100) * SCHEDULE_BODY_HEIGHT_PX;
      scrollEl.scrollTop = Math.max(0, topPx - scrollEl.clientHeight / 3);
      return;
    }

    scrollEl.scrollTop = 0;
  }, [weekStart, showNowLine, nowTopPercent]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-surface shadow-surface">
      <div className="flex shrink-0 border-b bg-surface">
        <div className="w-14 shrink-0 border-r" />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {weekDays.map((day) => {
            const dateKey = formatDate(day);
            const selected = selectedDate === dateKey;
            const today = isToday(day);

            return (
              <div
                key={dateKey}
                className={cn(
                    "border-r px-2 py-2 text-center last:border-r-0",
                    today && "bg-accent/10",
                    selected && "bg-accent/15",
                )}
              >
                <button
                  type="button"
                  className="w-full"
                  onClick={() => onSelectDate(dateKey)}
                >
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      today ? "text-accent" : "text-foreground",
                    )}
                  >
                    {weekdayLabel(day)}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      today ? "text-accent/80" : "text-muted",
                    )}
                  >
                    {day.getMonth() + 1}月{day.getDate()}日
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="flex">
          <div
            className="relative w-14 shrink-0 border-r bg-surface"
            style={{ height: SCHEDULE_BODY_HEIGHT_PX }}
          >
            {SCHEDULE_HOUR_LABELS.slice(0, -1).map((label, index) => (
              <div
                key={label}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted"
                style={{ top: index * SCHEDULE_HOUR_HEIGHT_PX }}
              >
                {label}
              </div>
            ))}
            <div
              className="absolute right-2 -translate-y-1/2 text-xs text-muted"
              style={{ top: SCHEDULE_BODY_HEIGHT_PX }}
            >
              {SCHEDULE_HOUR_LABELS[SCHEDULE_HOUR_LABELS.length - 1]}
            </div>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-7">
            {weekDays.map((day) => {
              const dateKey = formatDate(day);
              const dayInstances = grouped[dateKey] ?? [];
              const layouted = layoutDayInstances(dayInstances);
              const selected = selectedDate === dateKey;
              const today = isToday(day);

              return (
                <div
                  key={dateKey}
                  className={cn(
                    "relative cursor-pointer border-r last:border-r-0",
                    today && "bg-accent/10",
                    selected && "bg-accent/15",
                  )}
                  style={{ height: SCHEDULE_BODY_HEIGHT_PX }}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("[data-lesson-block]")) {
                      return;
                    }

                    onSelectDate(dateKey);
                    const rect = event.currentTarget.getBoundingClientRect();
                    const offsetY = event.clientY - rect.top;
                    const startTime = getTimeFromClickOffset(
                      offsetY,
                      SCHEDULE_BODY_HEIGHT_PX,
                    );
                    onCreateAtSlot(dateKey, startTime, getDefaultEndTime(startTime));
                  }}
                >
                  {Array.from({ length: SCHEDULE_HOUR_COUNT }, (_, index) => (
                    <div
                      key={index}
                      className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                      style={{ top: index * SCHEDULE_HOUR_HEIGHT_PX }}
                    />
                  ))}

                  {showNowLine && isSameDay(day, now) ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: `${nowTopPercent}%` }}
                    >
                      <div className="h-2 w-2 rounded-full bg-danger" />
                      <div className="h-0.5 flex-1 bg-danger" />
                    </div>
                  ) : null}

                  {layouted.map(({ instance, column, columnCount }) => {
                    const top = timeToTopPercent(instance.startTime);
                    const height = timeRangeToHeightPercent(
                      instance.startTime,
                      instance.endTime,
                    );
                    const showTime =
                      blockHeightPx(instance.startTime, instance.endTime) >=
                      MIN_BLOCK_HEIGHT_FOR_TIME_PX;
                    const width = 100 / columnCount;
                    const left = column * width;

                    return (
                      <button
                        key={`${instance.ruleId}-${instance.originalDate}`}
                        type="button"
                        data-lesson-block
                        className="absolute z-10 overflow-hidden rounded-md border border-accent/25 bg-accent-soft px-1.5 py-1 text-left text-xs transition hover:bg-accent-soft-hover"
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectDate(dateKey);
                          onSelectLesson(instance);
                        }}
                      >
                        <p className="truncate font-medium leading-tight">
                          {instance.title}
                        </p>
                        {showTime ? (
                          <p className="truncate text-[10px] text-muted">
                            {instance.startTime} - {instance.endTime}
                          </p>
                        ) : null}
                        <RecurringMark
                          instance={instance}
                          className="mt-1 inline-flex text-muted"
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

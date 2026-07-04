import { format, isSameDay } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LessonInstance } from "@/types/lesson";
import {
  formatDate,
  getDefaultEndTime,
  getTimeFromClickOffset,
  getWeekDays,
  groupInstancesByDate,
  isDateInWeek,
  isToday,
  layoutDayInstances,
  SCHEDULE_BODY_HEIGHT_PX,
  SCHEDULE_DAY_END_MINUTES,
  SCHEDULE_DAY_START_MINUTES,
  SCHEDULE_HOUR_COUNT,
  SCHEDULE_HOUR_HEIGHT_PX,
  timeRangeToHeightPercent,
  timeToMinutes,
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

const HOUR_LABELS = Array.from({ length: SCHEDULE_HOUR_COUNT + 1 }, (_, index) => {
  const hour = 8 + index;
  return `${String(hour).padStart(2, "0")}:00`;
});

const MIN_BLOCK_HEIGHT_FOR_TIME = 40;

function isWithinScheduleWindow(nowMinutes: number): boolean {
  return nowMinutes >= SCHEDULE_DAY_START_MINUTES && nowMinutes <= SCHEDULE_DAY_END_MINUTES;
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
  const [now, setNow] = useState(() => new Date());

  const todayInWeek = useMemo(
    () => isDateInWeek(now, weekStart),
    [now, weekStart],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }

    if (todayInWeek) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (isWithinScheduleWindow(nowMinutes)) {
        const topPx =
          ((nowMinutes - SCHEDULE_DAY_START_MINUTES) /
            (SCHEDULE_DAY_END_MINUTES - SCHEDULE_DAY_START_MINUTES)) *
          SCHEDULE_BODY_HEIGHT_PX;
        scrollEl.scrollTop = Math.max(0, topPx - scrollEl.clientHeight / 3);
        return;
      }
    }

    scrollEl.scrollTop = 0;
  }, [weekStart, todayInWeek, now]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = todayInWeek && isWithinScheduleWindow(nowMinutes);
  const nowTopPercent =
    ((nowMinutes - SCHEDULE_DAY_START_MINUTES) /
      (SCHEDULE_DAY_END_MINUTES - SCHEDULE_DAY_START_MINUTES)) *
    100;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex shrink-0 border-b bg-card">
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
                  today && "bg-primary/5",
                  selected && "bg-primary/10",
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
                      today ? "text-primary" : "text-foreground",
                    )}
                  >
                    {weekdayLabel(day)}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      today ? "text-primary/80" : "text-muted-foreground",
                    )}
                  >
                    {format(day, "M月d日")}
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
            className="relative w-14 shrink-0 border-r bg-card"
            style={{ height: SCHEDULE_BODY_HEIGHT_PX }}
          >
            {HOUR_LABELS.slice(0, -1).map((label, index) => (
              <div
                key={label}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
                style={{ top: index * SCHEDULE_HOUR_HEIGHT_PX }}
              >
                {label}
              </div>
            ))}
            <div
              className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
              style={{ top: SCHEDULE_BODY_HEIGHT_PX }}
            >
              {HOUR_LABELS[HOUR_LABELS.length - 1]}
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
                    today && "bg-primary/[0.03]",
                    selected && "bg-primary/[0.06]",
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
                          <div className="h-2 w-2 rounded-full bg-destructive" />
                          <div className="h-0.5 flex-1 bg-destructive" />
                        </div>
                      ) : null}

                      {layouted.map(({ instance, column, columnCount }) => {
                        const top = timeToTopPercent(instance.startTime);
                        const height = timeRangeToHeightPercent(
                          instance.startTime,
                          instance.endTime,
                        );
                        const blockHeightPx =
                          (timeToMinutes(instance.endTime) -
                            timeToMinutes(instance.startTime)) *
                          (SCHEDULE_BODY_HEIGHT_PX /
                            (SCHEDULE_DAY_END_MINUTES - SCHEDULE_DAY_START_MINUTES));
                        const showTime = blockHeightPx >= MIN_BLOCK_HEIGHT_FOR_TIME;
                        const width = 100 / columnCount;
                        const left = column * width;

                        return (
                          <button
                            key={`${instance.ruleId}-${instance.date}`}
                            type="button"
                            data-lesson-block
                            className="absolute z-10 overflow-hidden rounded-md border border-primary/20 bg-primary/15 px-1.5 py-1 text-left text-xs transition hover:bg-primary/25"
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
                              <p className="truncate text-[10px] text-muted-foreground">
                                {instance.startTime} - {instance.endTime}
                              </p>
                            ) : null}
                            {instance.isRecurring ? (
                              <Badge
                                variant="secondary"
                                className="mt-1 h-4 px-1 text-[10px]"
                              >
                                循环
                              </Badge>
                            ) : null}
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

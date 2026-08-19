/** Month grid of lesson instances. */

import { RecurringMark } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { LessonInstance } from "@/types/lesson";
import {
  formatDate,
  getMonthGridDays,
  groupInstancesByDate,
  isToday,
  WEEKDAY_HEADERS,
} from "@/lib/schedule";
import { isSameMonth } from "@/lib/dates";

interface MonthViewProps {
  monthStart: Date;
  instances: LessonInstance[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onSelectLesson: (instance: LessonInstance) => void;
  onCreateOnDate: (date: string) => void;
}

export function MonthView({
  monthStart,
  instances,
  selectedDate,
  onSelectDate,
  onSelectLesson,
  onCreateOnDate,
}: MonthViewProps) {
  const gridDays = getMonthGridDays(monthStart);
  const grouped = groupInstancesByDate(instances);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/30">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="border-r px-2 py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
        {gridDays.map((day) => {
          const dateKey = formatDate(day);
          const dayInstances = grouped[dateKey] ?? [];
          const selected = selectedDate === dateKey;
          const today = isToday(day);
          const overflow = !isSameMonth(day, monthStart);

          return (
            <div
              key={dateKey}
              className={cn(
                "flex min-h-0 flex-col border-b border-r last:border-r-0 [&:nth-child(7n)]:border-r-0",
                selected && "bg-primary/10",
                overflow && "bg-muted/20",
              )}
            >
              <div className="px-2 pt-1">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                    today
                      ? "bg-primary text-primary-foreground"
                      : overflow
                        ? "text-muted-foreground"
                        : "text-foreground hover:bg-muted",
                  )}
                  onClick={() => onSelectDate(dateKey)}
                >
                  {day.getDate()}
                </button>
              </div>

              <div
                className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1"
                onClick={() => {
                  onSelectDate(dateKey);
                  onCreateOnDate(dateKey);
                }}
              >
                {dayInstances.map((instance) => (
                  <button
                    key={`${instance.ruleId}-${instance.originalDate}`}
                    type="button"
                    className="truncate rounded px-1.5 py-0.5 text-left text-xs leading-tight border border-primary/20 bg-primary/15 hover:bg-primary/25"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectDate(dateKey);
                      onSelectLesson(instance);
                    }}
                  >
                    <span className="font-medium">{instance.title}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      {instance.startTime}
                    </span>
                    <RecurringMark
                      instance={instance}
                      className="ml-1 inline-flex align-middle text-muted-foreground"
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

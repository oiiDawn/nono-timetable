import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarViewMode } from "@/lib/schedule";

interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  title: string;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function CalendarToolbar({
  viewMode,
  title,
  onViewModeChange,
  onPrevious,
  onNext,
}: CalendarToolbarProps) {
  return (
    <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
      <div className="inline-flex rounded-md border p-0.5">
        {(["month", "week"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              viewMode === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onViewModeChange(mode)}
          >
            {mode === "month" ? "月" : "周"}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center justify-center gap-2">
        <Button variant="outline" size="icon" aria-label="上一页" onClick={onPrevious}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="truncate text-center text-lg font-semibold">{title}</h2>
        <Button variant="outline" size="icon" aria-label="下一页" onClick={onNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

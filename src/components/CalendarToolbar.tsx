/** Month/week switcher and period navigation. */

import { Button, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
      <ToggleButtonGroup
        disallowEmptySelection
        aria-label="视图切换"
        selectionMode="single"
        selectedKeys={[viewMode]}
        onSelectionChange={(keys) => {
          const mode = [...keys][0] as CalendarViewMode | undefined;
          if (mode) onViewModeChange(mode);
        }}
      >
        <ToggleButton id="month">月</ToggleButton>
        <ToggleButton id="week">
          <ToggleButtonGroup.Separator />周
        </ToggleButton>
      </ToggleButtonGroup>

      <div className="flex min-w-0 items-center gap-1">
        <Button isIconOnly variant="ghost" aria-label="上一页" onPress={onPrevious}>
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="min-w-32 truncate text-center text-lg font-semibold">{title}</h2>
        <Button isIconOnly variant="ghost" aria-label="下一页" onPress={onNext}>
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}

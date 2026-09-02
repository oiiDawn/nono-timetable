/** Month/week switcher, period navigation, and lesson title filter. */

import { Button, Input, Label, TextField, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarViewMode } from "@/lib/schedule";

interface CalendarToolbarProps {
  viewMode: CalendarViewMode;
  title: string;
  titleFilter: string;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onTitleFilterChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function CalendarToolbar({
  viewMode,
  title,
  titleFilter,
  onViewModeChange,
  onTitleFilterChange,
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

      <TextField className="w-full sm:w-64" value={titleFilter} onChange={onTitleFilterChange}>
        <Label className="sr-only">按课程名称过滤</Label>
        <Input type="search" placeholder="过滤课程名称" fullWidth />
      </TextField>
    </div>
  );
}

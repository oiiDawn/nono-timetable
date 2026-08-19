/** Small accessible marks that flag recurring or rescheduled lessons. */

import { ClockArrowUp, Repeat } from "lucide-react";
import type { LessonInstance } from "@/types/lesson";

export function RecurringMark({
  instance,
  className,
}: {
  instance: Pick<LessonInstance, "isRecurring" | "isException">;
  className?: string;
}) {
  if (!instance.isRecurring) return null;
  const label = instance.isException ? "临时调课" : "循环课程";
  return (
    <span className={className} title={label} aria-label={label}>
      {instance.isException ? (
        <ClockArrowUp className="size-3" />
      ) : (
        <Repeat className="size-3" />
      )}
    </span>
  );
}

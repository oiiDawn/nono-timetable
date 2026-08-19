/** Shared icon marks and the remaining legacy inline SVG close icon. */

import { ClockArrowUp, Repeat } from "lucide-react";
import type { SVGProps } from "react";
import type { LessonInstance } from "@/types/lesson";

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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

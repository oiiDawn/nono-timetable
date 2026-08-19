/** Inline SVG icons used by the timetable. */

import type { LessonInstance } from "@/types/lesson";
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
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
    />
  );
}

export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function IconRepeat(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="m2 9 3-3 3 3" />
      <path d="M8 6v6a2 2 0 0 0 2 2h8" />
      <path d="m22 15-3 3-3-3" />
      <path d="M16 18v-6a2 2 0 0 0-2-2H6" />
    </Icon>
  );
}

export function IconClockArrowUp(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 6v6l2 2" />
      <path d="M16 2v4h4" />
      <path d="M21.17 8.18A10 10 0 1 1 12 2a10 10 0 0 1 8.35 4.35" />
    </Icon>
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
        <IconClockArrowUp className="size-3" />
      ) : (
        <IconRepeat className="size-3" />
      )}
    </span>
  );
}

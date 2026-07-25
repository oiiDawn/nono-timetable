import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getDefaultEndTime,
  getEndTimeOptions,
  getScheduleTimeOptions,
} from "@/lib/schedule";
import type { ConflictInfo, LessonFormValues } from "@/types/lesson";

interface LessonFormProps {
  open: boolean;
  title: string;
  initialValues: LessonFormValues;
  conflicts: ConflictInfo[];
  onDelete?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LessonFormValues) => void;
}

const nativeSelectClassName = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export function LessonForm({
  open,
  title,
  initialValues,
  conflicts,
  onDelete,
  onOpenChange,
  onSubmit,
}: LessonFormProps) {
  const [values, setValues] = useState(initialValues);
  const startTimeOptions = useMemo(() => getScheduleTimeOptions(), []);
  const endTimeOptions = useMemo(
    () => getEndTimeOptions(values.startTime),
    [values.startTime],
  );

  useEffect(() => {
    if (open) {
      setValues(initialValues);
    }
  }, [initialValues, open]);

  useEffect(() => {
    if (!endTimeOptions.includes(values.endTime)) {
      setValues((current) => ({
        ...current,
        endTime: endTimeOptions[0] ?? current.endTime,
      }));
    }
  }, [endTimeOptions, values.endTime]);

  const update = <K extends keyof LessonFormValues>(key: K, value: LessonFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(values);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="title">名称</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="小九、佑佑..."
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="startDate">开始日期</Label>
              <Input
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(event) => update("startDate", event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">开始时间</Label>
              <select
                id="startTime"
                className={nativeSelectClassName}
                value={values.startTime}
                onChange={(event) => {
                  const startTime = event.target.value;
                  setValues((current) => ({
                    ...current,
                    startTime,
                    endTime: getDefaultEndTime(startTime),
                  }));
                }}
              >
                {!startTimeOptions.includes(values.startTime) ? (
                  <option value={values.startTime} disabled>
                    {values.startTime}
                  </option>
                ) : null}
                {startTimeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">结束时间</Label>
              <select
                id="endTime"
                className={nativeSelectClassName}
                value={values.endTime}
                onChange={(event) => update("endTime", event.target.value)}
              >
                {endTimeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">备注</Label>
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="可选"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.isRepeating}
              onChange={(event) => update("isRepeating", event.target.checked)}
            />
            按周期重复
          </label>

          {values.isRepeating ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>每</span>
                <Input
                  id="intervalDays"
                  type="number"
                  min={1}
                  className="h-9 w-16 px-2 text-center"
                  value={values.intervalDays}
                  onChange={(event) =>
                    update("intervalDays", Number(event.target.value) || 1)
                  }
                />
                <span>天重复一次</span>
              </div>

              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm font-medium">结束方式</legend>

                <div className="flex h-9 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="endType"
                    id="endType-count"
                    value="count"
                    checked={values.endType === "count"}
                    onChange={() => update("endType", "count")}
                    className="size-4 shrink-0"
                  />
                  <label htmlFor="endType-count" className="shrink-0">
                    按循环次数
                  </label>
                  <div className="inline-flex h-9 items-center gap-2">
                    <Input
                      id="endCount"
                      type="number"
                      min={1}
                      className={cn(
                        "h-9 w-20 px-2 text-center",
                        values.endType !== "count" && "invisible",
                      )}
                      disabled={values.endType !== "count"}
                      tabIndex={values.endType === "count" ? 0 : -1}
                      value={values.endCount}
                      onChange={(event) =>
                        update("endCount", Number(event.target.value) || 1)
                      }
                    />
                    <span
                      className={cn("shrink-0", values.endType !== "count" && "invisible")}
                    >
                      次
                    </span>
                  </div>
                </div>

                <div className="flex h-9 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="endType"
                    id="endType-date"
                    value="date"
                    checked={values.endType === "date"}
                    onChange={() => update("endType", "date")}
                    className="size-4 shrink-0"
                  />
                  <label htmlFor="endType-date" className="shrink-0">
                    按结束日期
                  </label>
                  <Input
                    id="endDate"
                    type="date"
                    className={cn(
                      "h-9 w-36",
                      values.endType !== "date" && "invisible",
                    )}
                    disabled={values.endType !== "date"}
                    tabIndex={values.endType === "date" ? 0 : -1}
                    value={values.endDate}
                    onChange={(event) => update("endDate", event.target.value)}
                  />
                </div>
              </fieldset>
            </div>
          ) : null}

          {conflicts.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">检测到 {conflicts.length} 处时间冲突，仍可保存。</p>
              <ul className="mt-2 space-y-1">
                {conflicts.slice(0, 3).map((conflict) => (
                  <li key={`${conflict.instance.date}-${conflict.instance.startTime}`}>
                    {conflict.instance.date} {conflict.instance.startTime} 与{" "}
                    {conflict.conflictsWith.map((item) => item.title).join("、")} 重叠
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {onDelete ? (
              <Button type="button" variant="destructive" onClick={onDelete}>
                删除
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Fill a new lesson's name and notes from a saved student. */

import { Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { fetchLessonPresets } from "@/lib/api";
import type { LessonPreset } from "@/types/lesson";

export function StudentPicker({ onSelect }: { onSelect: (student: LessonPreset) => void }) {
  const [students, setStudents] = useState<LessonPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchLessonPresets()
      .then((items) => {
        if (active) setStudents(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "学生加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  return (
    <section aria-label="选择学生" className="flex flex-col gap-2">
      {loading ? (
        <p role="status" className="text-sm text-muted">
          正在加载学生…
        </p>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{error}</p>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            onPress={() => setReload((current) => current + 1)}
          >
            重新加载学生
          </Button>
        </div>
      ) : students.length === 0 ? (
        <p className="text-sm text-muted">暂无学生，可在顶部“学生管理”中添加。</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {students.map((student) => (
            <li key={student.id} className="max-w-full min-w-0">
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                className="max-w-full min-w-0 rounded-full"
                onPress={() => onSelect(student)}
              >
                <span
                  className="truncate"
                  title={student.notes ? `${student.title} · ${student.notes}` : student.title}
                >
                  {student.title}
                  {student.notes ? <span className="text-muted"> · {student.notes}</span> : null}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

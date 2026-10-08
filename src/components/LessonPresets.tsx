/** Pick and maintain cloud name/notes presets inside the new-lesson form. */

import { Button, Input, Label, TextArea, TextField, toast } from "@heroui/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { fetchLessonPresets, removeLessonPreset, saveLessonPreset } from "@/lib/api";
import type { LessonPreset } from "@/types/lesson";

interface LessonPresetsProps {
  title: string;
  notes: string;
  footer: HTMLDivElement | null;
  onSelect: (preset: LessonPreset) => void;
}

export function LessonPresets({ title, notes, footer, onSelect }: LessonPresetsProps) {
  const [presets, setPresets] = useState<LessonPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<LessonPreset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = loading || saving;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setEditing(null);
    setConfirmDelete(false);
    void fetchLessonPresets()
      .then((items) => {
        if (active) setPresets(items);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "常用项加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const save = async (existing?: LessonPreset) => {
    const values = existing ?? { title, notes };
    if (!values.title.trim() || values.title.trim().length > 200 || values.notes.length > 10_000) {
      setError("请填写 1 至 200 个字符的名称，备注最多 10000 个字符");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveLessonPreset(values, existing);
      setPresets((current) =>
        existing
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved],
      );
      setEditing(null);
      setConfirmDelete(false);
      toast.success(existing ? "常用项已更新" : "已保存为常用");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "常用项保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await removeLessonPreset(editing);
      setPresets((current) => current.filter((item) => item.id !== editing.id));
      setEditing(null);
      setConfirmDelete(false);
      toast.success("常用项已删除");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "常用项删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="常用名称与备注" className="flex flex-col gap-2">
      {footer
        ? createPortal(
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isDisabled={busy || !title.trim()}
              onPress={() => void save()}
            >
              保存为常用
            </Button>,
            footer,
          )
        : null}
      {loading ? (
        <p role="status" className="text-sm text-muted">
          正在加载常用项…
        </p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-muted">填写名称和备注后，可在底部保存为常用。</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex max-w-full min-w-0 items-center rounded-full bg-default"
            >
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                isDisabled={busy}
                className="min-w-0 rounded-l-full rounded-r-none"
                onPress={() => onSelect(preset)}
              >
                <span
                  className="truncate"
                  title={preset.notes ? `${preset.title} · ${preset.notes}` : preset.title}
                >
                  {preset.title}
                  {preset.notes ? <span className="text-muted"> · {preset.notes}</span> : null}
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                isIconOnly
                className="shrink-0 rounded-l-none rounded-r-full"
                variant="tertiary"
                isDisabled={busy}
                aria-label={`编辑常用项 ${preset.title}`}
                onPress={() => {
                  setEditing({ ...preset });
                  setConfirmDelete(false);
                  setError(null);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <div
          className="flex flex-col gap-3 border-t border-separator pt-3"
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement)
              event.preventDefault();
          }}
        >
          <TextField
            value={editing.title}
            isDisabled={saving}
            onChange={(value) => setEditing({ ...editing, title: value })}
          >
            <Label>常用名称</Label>
            <Input maxLength={200} />
          </TextField>
          <TextField
            value={editing.notes}
            isDisabled={saving}
            onChange={(value) => setEditing({ ...editing, notes: value })}
          >
            <Label>常用备注</Label>
            <TextArea rows={2} maxLength={10000} />
          </TextField>
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm">确定删除这个常用项吗？已保存的课程不受影响。</p>
              <Button
                type="button"
                size="sm"
                variant="danger"
                isDisabled={saving}
                onPress={() => void remove()}
              >
                确认删除
              </Button>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                isDisabled={saving}
                onPress={() => setConfirmDelete(false)}
              >
                取消删除
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                isDisabled={saving}
                onPress={() => void save(editing)}
              >
                保存常用项
              </Button>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                isDisabled={saving}
                onPress={() => setEditing(null)}
              >
                取消编辑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger-soft"
                isDisabled={saving}
                onPress={() => setConfirmDelete(true)}
              >
                删除常用项
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <p>{error}</p>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            isDisabled={busy}
            onPress={() => setReload((current) => current + 1)}
          >
            重新加载常用项
          </Button>
        </div>
      ) : null}
    </section>
  );
}

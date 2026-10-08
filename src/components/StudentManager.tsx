/** Manage saved student names and default notes without changing existing lessons. */

import { Button, Form, Input, Label, Modal, TextArea, TextField, toast } from "@heroui/react";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchLessonPresets, removeLessonPreset, saveLessonPreset } from "@/lib/api";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/lib/use-media-query";
import type { LessonPreset } from "@/types/lesson";

export function StudentManager({ onClose }: { onClose: () => void }) {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [students, setStudents] = useState<LessonPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<LessonPreset | null>(null);
  const [draft, setDraft] = useState<Pick<LessonPreset, "title" | "notes"> | null>(null);
  const [deleting, setDeleting] = useState<LessonPreset | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setDraft(null);
    setEditing(null);
    setDeleting(null);
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

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.title.trim() || draft.title.trim().length > 200 || draft.notes.length > 10_000) {
      setError("请填写 1 至 200 个字符的学生姓名，默认备注最多 10000 个字符");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveLessonPreset(draft, editing ?? undefined);
      setStudents((current) =>
        editing
          ? current.map((student) => (student.id === saved.id ? saved : student))
          : [...current, saved],
      );
      setDraft(null);
      setEditing(null);
      toast.success(editing ? "学生已更新" : "学生已添加");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学生保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting || saving) return;
    setSaving(true);
    setError(null);
    try {
      await removeLessonPreset(deleting);
      setStudents((current) => current.filter((student) => student.id !== deleting.id));
      setDeleting(null);
      toast.success("学生已删除");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学生删除失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!saving}
      isKeyboardDismissDisabled={saving}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Modal.Container
        placement={isMobile ? "bottom" : "center"}
        scroll="inside"
        size={isMobile ? "full" : "md"}
      >
        <Modal.Dialog>
          <Modal.CloseTrigger isDisabled={saving} />
          <Form
            className="flex min-h-0 flex-1 flex-col"
            validationBehavior="aria"
            onSubmit={(event) => {
              event.preventDefault();
              if (!deleting) void save();
            }}
          >
            <Modal.Header>
              <Modal.Heading>学生管理</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {draft ? (
                <>
                  <TextField
                    isRequired
                    value={draft.title}
                    isDisabled={saving}
                    onChange={(title) => setDraft({ ...draft, title })}
                  >
                    <Label>学生姓名</Label>
                    <Input maxLength={200} autoFocus />
                  </TextField>
                  <TextField
                    value={draft.notes}
                    isDisabled={saving}
                    onChange={(notes) => setDraft({ ...draft, notes })}
                  >
                    <Label>默认备注</Label>
                    <TextArea rows={3} maxLength={10000} placeholder="可选" />
                  </TextField>
                </>
              ) : loading ? (
                <p role="status" className="text-sm text-muted">
                  正在加载学生…
                </p>
              ) : students.length === 0 ? (
                <p className="text-sm text-muted">暂无学生，点击“新增学生”添加。</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {students.map((student) => (
                    <li
                      key={student.id}
                      className="flex min-w-0 items-center gap-3 rounded-lg bg-default p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">{student.title}</p>
                        {student.notes ? (
                          <p className="text-sm break-words whitespace-pre-wrap text-muted">
                            {student.notes}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        isIconOnly
                        variant="tertiary"
                        isDisabled={saving || Boolean(deleting)}
                        aria-label={`编辑学生 ${student.title}`}
                        onPress={() => {
                          setEditing(student);
                          setDraft({ title: student.title, notes: student.notes });
                          setError(null);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        isIconOnly
                        variant="danger-soft"
                        isDisabled={saving || Boolean(deleting)}
                        aria-label={`删除学生 ${student.title}`}
                        onPress={() => {
                          setDeleting(student);
                          setError(null);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {deleting ? <p>确定删除学生“{deleting.title}”吗？已保存的课程不受影响。</p> : null}
              {error ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
                  <p>{error}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="tertiary"
                    isDisabled={loading || saving}
                    onPress={() => setReload((current) => current + 1)}
                  >
                    重新加载学生
                  </Button>
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="flex-wrap gap-2">
              {deleting ? (
                <>
                  <Button
                    type="button"
                    variant="tertiary"
                    isDisabled={saving}
                    onPress={() => setDeleting(null)}
                  >
                    取消删除
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    isPending={saving}
                    onPress={() => void remove()}
                  >
                    确认删除
                  </Button>
                </>
              ) : draft ? (
                <>
                  <Button
                    type="button"
                    variant="tertiary"
                    isDisabled={saving}
                    onPress={() => {
                      setDraft(null);
                      setEditing(null);
                      setError(null);
                    }}
                  >
                    取消
                  </Button>
                  <Button type="submit" isPending={saving}>
                    保存学生
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="tertiary" onPress={onClose}>
                    关闭
                  </Button>
                  <Button
                    type="button"
                    isDisabled={loading || Boolean(error)}
                    onPress={() => {
                      setEditing(null);
                      setDraft({ title: "", notes: "" });
                      setError(null);
                    }}
                  >
                    新增学生
                  </Button>
                </>
              )}
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

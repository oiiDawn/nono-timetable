/** Create and edit a lesson, including Apple-style repeat presets. */

import {
  Alert,
  Button,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  Radio,
  RadioGroup,
  Select,
  TextArea,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  DEFAULT_REPEAT_COUNT,
  WEEKDAY_LABELS,
  WEEKDAYS,
  ensureStartWeekday,
  weekdayFromDate,
} from "@/lib/repeat";
import {
  getDefaultEndTime,
  getEndTimeOptions,
  getScheduleTimeOptions,
  validateFormValues,
} from "@/lib/schedule";
import type {
  ConflictInfo,
  LessonFormValues,
  RepeatPreset,
  Weekday,
} from "@/types/lesson";

interface LessonFormProps {
  open: boolean;
  title: string;
  initialValues: LessonFormValues;
  conflicts: ConflictInfo[];
  onDelete?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LessonFormValues) => void;
}

const REPEAT_PRESETS: { id: RepeatPreset; label: string }[] = [
  { id: "none", label: "不重复" },
  { id: "daily", label: "每天" },
  { id: "weekly", label: "每周" },
  { id: "custom", label: "自定义" },
];

function TimeSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (time: string) => void;
}) {
  const allOptions = options.includes(value) ? options : [value, ...options];
  return (
    <Select
      aria-label={label}
      className="w-full"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (typeof key === "string") onChange(key);
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger id={id}>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {allOptions.map((time) => (
            <ListBox.Item key={time} id={time} textValue={time}>
              {time}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

export function LessonForm({
  open,
  title,
  initialValues,
  conflicts,
  onDelete,
  onOpenChange,
  onSubmit,
}: LessonFormProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const startTimeOptions = useMemo(() => getScheduleTimeOptions(), []);
  const endTimeOptions = useMemo(
    () => getEndTimeOptions(values.startTime),
    [values.startTime],
  );
  const startWeekday = weekdayFromDate(values.startDate);
  const showCustom = values.repeatPreset === "custom";
  const showEnd = values.repeatPreset !== "none";

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setValidationError(null);
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
    setValidationError(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const setRepeatPreset = (preset: RepeatPreset) => {
    setValidationError(null);
    setValues((current) => {
      const next = { ...current, repeatPreset: preset };
      if (preset === "daily") {
        next.freq = "daily";
        next.interval = 1;
      } else if (preset === "weekly") {
        next.freq = "weekly";
        next.interval = 1;
        next.byWeekdays = [weekdayFromDate(current.startDate)];
      } else if (preset === "custom" && current.repeatPreset !== "custom") {
        next.freq = current.repeatPreset === "weekly" ? "weekly" : "daily";
        next.interval = current.repeatPreset === "none" ? 1 : current.interval;
        if (next.freq === "weekly") {
          next.byWeekdays = ensureStartWeekday(current.startDate, current.byWeekdays);
        }
      }
      if (preset !== "none" && current.repeatPreset === "none") {
        next.endType = "count";
        next.endCount = DEFAULT_REPEAT_COUNT;
      }
      return next;
    });
  };

  const setStartDate = (startDate: string) => {
    setValidationError(null);
    setValues((current) => {
      const previousWeekday = weekdayFromDate(current.startDate);
      let byWeekdays = current.byWeekdays;
      if (current.repeatPreset === "weekly") {
        byWeekdays = [weekdayFromDate(startDate)];
      } else if (current.repeatPreset === "custom" && current.freq === "weekly") {
        byWeekdays = ensureStartWeekday(
          startDate,
          current.byWeekdays.filter((day) => day !== previousWeekday),
        );
      }
      return { ...current, startDate, byWeekdays };
    });
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container
          placement={isMobile ? "bottom" : "center"}
          scroll="inside"
          size={isMobile ? "full" : "md"}
        >
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.CloseTrigger />
            <Form
              className="flex min-h-0 flex-1 flex-col"
              validationBehavior="aria"
              onSubmit={(event) => {
                event.preventDefault();
                const error = validateFormValues(values);
                if (error) {
                  setValidationError(error);
                  return;
                }
                onSubmit(values);
              }}
            >
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="flex flex-col gap-4">
                <TextField
                  isRequired
                  fullWidth
                  name="title"
                  value={values.title}
                  onChange={(value) => update("title", value)}
                >
                  <Label>名称</Label>
                  <Input placeholder="小九、佑佑..." />
                </TextField>

                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    isRequired
                    fullWidth
                    name="startDate"
                    type="date"
                    value={values.startDate}
                    onChange={setStartDate}
                  >
                    <Label>日期</Label>
                    <Input />
                  </TextField>
                  <TimeSelect
                    id="startTime"
                    label="开始时间"
                    value={values.startTime}
                    options={startTimeOptions}
                    onChange={(startTime) =>
                      setValues((current) => ({
                        ...current,
                        startTime,
                        endTime: getDefaultEndTime(startTime),
                      }))
                    }
                  />
                  <TimeSelect
                    id="endTime"
                    label="结束时间"
                    value={values.endTime}
                    options={endTimeOptions}
                    onChange={(endTime) => update("endTime", endTime)}
                  />
                </div>

                <TextField
                  fullWidth
                  name="notes"
                  value={values.notes}
                  onChange={(value) => update("notes", value)}
                >
                  <Label>备注</Label>
                  <TextArea placeholder="可选" rows={3} />
                </TextField>

                <Select
                  aria-label="重复"
                  className="w-full"
                  selectedKey={values.repeatPreset}
                  onSelectionChange={(key) => {
                    if (typeof key === "string") setRepeatPreset(key as RepeatPreset);
                  }}
                >
                  <Label>重复</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {REPEAT_PRESETS.map((preset) => (
                        <ListBox.Item
                          key={preset.id}
                          id={preset.id}
                          textValue={preset.label}
                        >
                          {preset.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                {showCustom ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span>每</span>
                      <TextField
                        aria-label="间隔"
                        type="number"
                        className="w-20"
                        value={String(values.interval)}
                        onChange={(value) => update("interval", Number(value) || 1)}
                      >
                        <Input className="text-center" min={1} />
                      </TextField>
                      <ToggleButtonGroup
                        disallowEmptySelection
                        aria-label="频率"
                        selectionMode="single"
                        selectedKeys={[values.freq]}
                        onSelectionChange={(keys) => {
                          const freq = [...keys][0] as LessonFormValues["freq"] | undefined;
                          if (!freq) return;
                          setValues((current) => ({
                            ...current,
                            freq,
                            byWeekdays:
                              freq === "weekly"
                                ? ensureStartWeekday(current.startDate, current.byWeekdays)
                                : current.byWeekdays,
                          }));
                        }}
                      >
                        <ToggleButton id="daily">天</ToggleButton>
                        <ToggleButton id="weekly">
                          <ToggleButtonGroup.Separator />周
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </div>

                    {values.freq === "weekly" ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium">重复于</p>
                        <ToggleButtonGroup
                          aria-label="重复星期"
                          selectionMode="multiple"
                          selectedKeys={values.byWeekdays}
                          onSelectionChange={(keys) => {
                            const selected = [...keys] as Weekday[];
                            setValues((current) => ({
                              ...current,
                              byWeekdays: ensureStartWeekday(current.startDate, selected),
                            }));
                          }}
                        >
                          {WEEKDAYS.map((day, index) => (
                            <ToggleButton
                              key={day}
                              id={day}
                              isDisabled={day === startWeekday}
                            >
                              {index > 0 ? <ToggleButtonGroup.Separator /> : null}
                              {WEEKDAY_LABELS[day]}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showEnd ? (
                  <RadioGroup
                    aria-label="结束方式"
                    value={values.endType}
                    onChange={(value) => update("endType", value as LessonFormValues["endType"])}
                  >
                    <Label>结束方式</Label>
                    <div className="flex flex-col gap-3 pt-1">
                      <Radio value="count">
                        <Radio.Content>
                          <Radio.Control>
                            <Radio.Indicator />
                          </Radio.Control>
                          <span className="flex items-center gap-2 text-sm">
                            重复
                            <TextField
                              aria-label="重复次数"
                              type="number"
                              className="w-20"
                              isDisabled={values.endType !== "count"}
                              value={String(values.endCount)}
                              onChange={(value) => update("endCount", Number(value) || 1)}
                            >
                              <Input className="text-center" min={1} />
                            </TextField>
                            次
                          </span>
                        </Radio.Content>
                      </Radio>
                      <Radio value="date">
                        <Radio.Content>
                          <Radio.Control>
                            <Radio.Indicator />
                          </Radio.Control>
                          <span className="flex items-center gap-2 text-sm">
                            结束于
                            <TextField
                              aria-label="结束日期"
                              type="date"
                              isDisabled={values.endType !== "date"}
                              value={values.endDate}
                              onChange={(value) => update("endDate", value)}
                            >
                              <Input />
                            </TextField>
                          </span>
                        </Radio.Content>
                      </Radio>
                    </div>
                  </RadioGroup>
                ) : null}

                {conflicts.length > 0 ? (
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>
                        检测到 {conflicts.length} 处时间冲突，仍可保存。
                      </Alert.Title>
                      <Alert.Description>
                        <ul className="mt-1 space-y-1">
                          {conflicts.slice(0, 3).map((conflict) => (
                            <li
                              key={`${conflict.instance.originalDate}-${conflict.instance.startTime}`}
                            >
                              {conflict.instance.date} {conflict.instance.startTime} 与{" "}
                              {conflict.conflictsWith.map((item) => item.title).join("、")}{" "}
                              重叠
                            </li>
                          ))}
                        </ul>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                {validationError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>{validationError}</Alert.Title>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </Modal.Body>

              <Modal.Footer className="justify-between">
                {onDelete ? (
                  <Button type="button" variant="danger-soft" onPress={onDelete}>
                    删除
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="tertiary" onPress={() => onOpenChange(false)}>
                    取消
                  </Button>
                  <Button type="submit">保存</Button>
                </div>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

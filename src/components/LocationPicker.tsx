/** Calendar-style place search with custom text, full addresses, and map access. */

import { Button, ComboBox, Input, Label, ListBox, TextField } from "@heroui/react";
import { MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import { searchLocations } from "@/lib/api";
import { locationMapUrl } from "@/lib/location";
import type { LessonLocation } from "@/types/lesson";

interface LocationPickerProps {
  value: LessonLocation | null;
  onChange: (location: LessonLocation | null) => void;
  isDisabled?: boolean;
}

function placeKey(place: LessonLocation): string {
  return place.poiId ?? `${place.longitude},${place.latitude}`;
}

export function LocationPicker({ value, onChange, isDisabled = false }: LocationPickerProps) {
  const [results, setResults] = useState<LessonLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const query = value?.name ?? "";
  const hasCoordinates = value?.longitude !== undefined;

  useEffect(() => {
    setResults([]);
    setError(null);
    setLoading(false);
    if (isDisabled || hasCoordinates || query.trim().length < 2) return;
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchLocations(query, controller.signal)
        .then((places) => {
          if (!controller.signal.aborted) setResults(places);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(reason instanceof Error ? reason.message : "地点搜索失败，可手动填写");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, hasCoordinates, isDisabled, retry]);

  const items = hasCoordinates && value ? [value] : results;
  const emptyText = loading
    ? "正在搜索地点…"
    : (error ??
      (query.trim().length < 2
        ? "输入地点名称或地址"
        : "暂无匹配地点，可添加城市名继续搜索或直接保存文字"));

  return (
    <div className="flex flex-col gap-2">
      <ComboBox
        fullWidth
        allowsCustomValue
        allowsEmptyCollection
        isDisabled={isDisabled}
        items={items}
        inputValue={query}
        selectedKey={hasCoordinates && value ? placeKey(value) : null}
        onInputChange={(name) => {
          if (name === value?.name) return;
          onChange(name.trim() ? { name, address: "", detail: "" } : null);
        }}
        onSelectionChange={(key) => {
          const place = items.find((item) => placeKey(item) === key);
          if (place) {
            onChange({ ...place, detail: "" });
          }
        }}
      >
        <Label>地点</Label>
        <ComboBox.InputGroup>
          <Input placeholder="搜索地点或输入地址（可选）" maxLength={200} />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover>
          <ListBox<LessonLocation>
            renderEmptyState={() => (
              <p role="status" className="px-3 py-4 text-sm text-muted">
                {emptyText}
              </p>
            )}
          >
            {(place) => (
              <ListBox.Item id={placeKey(place)} textValue={place.name}>
                <MapPin className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{place.name}</p>
                  <p className="text-xs break-words text-muted">{place.address}</p>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      {error ? (
        <div className="flex items-center gap-2 text-sm text-muted" role="status">
          <span>{error}</span>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            isDisabled={isDisabled || loading}
            onPress={() => setRetry((count) => count + 1)}
          >
            重试
          </Button>
        </div>
      ) : null}
      {value ? (
        <>
          {value.address ? <p className="text-sm break-words text-muted">{value.address}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <a
              className="inline-flex items-center gap-1 text-sm text-accent underline-offset-4 hover:underline"
              href={locationMapUrl(value)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="size-4" />
              {hasCoordinates ? "查看地图" : "在地图中搜索"}
            </a>
            <Button
              type="button"
              size="sm"
              variant="tertiary"
              isDisabled={isDisabled}
              onPress={() => {
                onChange(null);
              }}
            >
              <X className="size-3" />
              清空地点
            </Button>
          </div>
          <TextField
            fullWidth
            isDisabled={isDisabled}
            value={value.detail}
            onChange={(detail) => onChange({ ...value, detail })}
          >
            <Label>地点补充</Label>
            <Input placeholder="楼层、房间或门牌号（可选）" maxLength={500} />
          </TextField>
        </>
      ) : null}
    </div>
  );
}

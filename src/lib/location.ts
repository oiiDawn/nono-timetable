/** Validate saved places and format their text and official Gaode map links. */

import type { LessonLocation } from "../types/lesson.js";

export function parseLocation(value: unknown): LessonLocation | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("地点数据无效");
  const place = value as Record<string, unknown>;
  for (const field of ["name", "address", "detail"] as const) {
    if (typeof place[field] !== "string" || place[field].length > 500) {
      throw new Error("地点名称、地址和补充说明最多 500 个字符");
    }
  }
  if (!(place.name as string).trim()) throw new Error("请填写地点名称");
  const result: LessonLocation = {
    name: (place.name as string).trim(),
    address: (place.address as string).trim(),
    detail: (place.detail as string).trim(),
  };
  if (place.poiId !== undefined) {
    if (typeof place.poiId !== "string" || !place.poiId.trim() || place.poiId.length > 200) {
      throw new Error("地图地点编号无效");
    }
    result.poiId = place.poiId.trim();
  }
  if (place.longitude !== undefined || place.latitude !== undefined) {
    if (
      typeof place.longitude !== "number" ||
      !Number.isFinite(place.longitude) ||
      typeof place.latitude !== "number" ||
      !Number.isFinite(place.latitude) ||
      Math.abs(place.longitude) > 180 ||
      Math.abs(place.latitude) > 90
    )
      throw new Error("地点坐标无效");
    result.longitude = place.longitude;
    result.latitude = place.latitude;
  }
  if (result.poiId && result.longitude === undefined) throw new Error("地图地点缺少坐标");
  return result;
}

export function locationText(location: LessonLocation | null | undefined): string {
  if (!location) return "";
  return [...new Set([location.name, location.address, location.detail].filter(Boolean))].join(
    " · ",
  );
}

export function locationMapUrl(location: LessonLocation): string {
  const selected = location.longitude !== undefined && location.latitude !== undefined;
  const url = new URL(selected ? "https://uri.amap.com/marker" : "https://uri.amap.com/search");
  if (selected) {
    url.searchParams.set("position", `${location.longitude},${location.latitude}`);
    url.searchParams.set("name", location.name);
    url.searchParams.set("coordinate", "gaode");
  } else {
    url.searchParams.set(
      "keyword",
      [...new Set([location.name, location.address].filter(Boolean))].join(" "),
    );
  }
  url.searchParams.set("src", "nono-timetable");
  url.searchParams.set("callnative", "1");
  return url.toString();
}

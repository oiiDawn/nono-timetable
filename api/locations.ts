/** Search Gaode POIs for signed-in users without exposing the server API key. */

import { requireAuth } from "../server/auth.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../server/http.js";
import { isRecord } from "../src/lib/repeat.js";
import { parseLocation } from "../src/lib/location.js";
import type { LessonLocation } from "../src/types/lesson.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      requireAuth(request);
      requireSameOrigin(request);
      const body = await readJson(request);
      if (
        !isRecord(body) ||
        typeof body.query !== "string" ||
        body.query.trim().length < 2 ||
        body.query.length > 200
      ) {
        throw new RequestError(400, "请输入 2 至 200 个字符的地点关键词");
      }
      const key = process.env.AMAP_KEY;
      if (!key) throw new RequestError(503, "地点搜索暂不可用，可手动填写地点");
      const url = new URL("https://restapi.amap.com/v3/place/text");
      url.searchParams.set("key", key);
      url.searchParams.set("keywords", body.query.trim());
      url.searchParams.set("offset", "10");
      url.searchParams.set("extensions", "base");
      let result: unknown;
      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error();
        result = await response.json();
      } catch {
        throw new RequestError(502, "地点搜索暂时失败，可重试或手动填写");
      }
      if (!isRecord(result) || result.status !== "1" || !Array.isArray(result.pois)) {
        throw new RequestError(502, "地点搜索暂不可用，可手动填写地点");
      }
      const locations: LessonLocation[] = [];
      for (const poi of result.pois) {
        if (!isRecord(poi) || typeof poi.name !== "string" || typeof poi.location !== "string")
          continue;
        const parts = poi.location.split(",");
        if (parts.length !== 2 || parts.some((part) => !part.trim())) continue;
        const address = [poi.pname, poi.cityname, poi.adname, poi.address].filter(
          (part): part is string => typeof part === "string" && Boolean(part.trim()),
        );
        try {
          const place = parseLocation({
            name: poi.name,
            address: [...new Set(address)].join(""),
            detail: "",
            poiId: typeof poi.id === "string" && poi.id ? poi.id : undefined,
            longitude: Number(parts[0]),
            latitude: Number(parts[1]),
          });
          if (place) locations.push(place);
        } catch {
          continue;
        }
      }
      return json({ locations });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

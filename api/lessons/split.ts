/** Split a recurring lesson into past and future series. */

import { requireAuth } from "../../server/auth.js";
import { splitLesson } from "../../server/db.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../../server/http.js";
import { isRecord } from "../../src/lib/repeat.js";
import { parseLessonRule } from "../../server/validation.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }
    try {
      requireAuth(request);
      requireSameOrigin(request);
      const body = await readJson(request);
      if (!isRecord(body)) throw new RequestError(400, "课程数据无效");
      const previous = parseLessonRule(body.previous);
      const next = parseLessonRule(body.next);
      const result = await splitLesson(previous, next);
      if (!result) throw new RequestError(409, "课程已在其他设备修改，请刷新后重试");
      return json(result, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

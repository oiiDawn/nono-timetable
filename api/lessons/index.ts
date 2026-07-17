import { requireAuth } from "../../server/auth.js";
import { createLesson, listLessons } from "../../server/db.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../../server/http.js";
import { parseLessonRule } from "../../server/validation.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "POST") {
      return methodNotAllowed(["GET", "POST"]);
    }
    try {
      requireAuth(request);
      if (request.method === "GET") {
        return json({ lessons: await listLessons() });
      }

      requireSameOrigin(request);
      const rule = parseLessonRule(await readJson(request));
      const created = await createLesson(rule);
      if (!created) throw new RequestError(409, "该课程已经存在，请刷新后重试");
      return json({ lesson: created }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

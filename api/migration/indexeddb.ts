import { requireAuth } from "../../server/auth.js";
import { migrateLessons } from "../../server/db.js";
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
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      requireAuth(request);
      requireSameOrigin(request);
      const body = await readJson(request);
      const values =
        typeof body === "object" && body !== null && "lessons" in body
          ? (body as { lessons?: unknown }).lessons
          : undefined;
      if (!Array.isArray(values) || values.length === 0 || values.length > 10_000) {
        throw new RequestError(400, "迁移课程列表无效");
      }
      const lessons = values.map(parseLessonRule);
      const result = await migrateLessons(lessons);
      if (result.existing > 0) {
        throw new RequestError(409, "云端已有课程，已取消迁移以避免覆盖");
      }
      if (result.inserted !== lessons.length) {
        throw new Error(`Migration inserted ${result.inserted} of ${lessons.length} lessons`);
      }
      return json({ migrated: result.inserted });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

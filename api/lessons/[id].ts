import { requireAuth } from "../../server/auth.js";
import { deleteLesson, updateLesson } from "../../server/db.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../../server/http.js";
import { parseLessonRule } from "../../server/validation.js";

function routeId(request: Request): string {
  const segments = new URL(request.url).pathname.split("/");
  return decodeURIComponent(segments.at(-1) ?? "");
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "PUT" && request.method !== "DELETE") {
      return methodNotAllowed(["PUT", "DELETE"]);
    }
    try {
      requireAuth(request);
      requireSameOrigin(request);
      const id = routeId(request);
      if (!id) throw new RequestError(400, "课程 ID 无效");

      if (request.method === "PUT") {
        const rule = parseLessonRule(await readJson(request));
        if (rule.id !== id) throw new RequestError(400, "课程 ID 不一致");
        const updated = await updateLesson(rule);
        if (!updated) throw new RequestError(409, "课程已在其他设备修改，请刷新后重试");
        return json({ lesson: updated });
      }

      const body = await readJson(request);
      const version =
        typeof body === "object" && body !== null && "version" in body
          ? (body as { version?: unknown }).version
          : undefined;
      if (!Number.isInteger(version)) throw new RequestError(400, "课程版本无效");
      if (!(await deleteLesson(id, version as number))) {
        throw new RequestError(409, "课程已在其他设备修改，请刷新后重试");
      }
      return json({ deleted: true });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

/** Authenticated CRUD for cloud presets; edits never change saved lessons. */

import { randomUUID } from "node:crypto";
import { requireAuth } from "../server/auth.js";
import {
  createLessonPreset,
  deleteLessonPreset,
  listLessonPresets,
  updateLessonPreset,
} from "../server/db.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../server/http.js";
import { parseLessonPreset, parsePresetIdentity } from "../server/validation.js";

const METHODS = ["GET", "POST", "PUT", "DELETE"];

export default {
  async fetch(request: Request): Promise<Response> {
    if (!METHODS.includes(request.method)) return methodNotAllowed(METHODS);
    try {
      requireAuth(request);
      if (request.method === "GET") return json({ presets: await listLessonPresets() });
      requireSameOrigin(request);
      const body = await readJson(request);
      if (request.method === "POST") {
        const preset = await createLessonPreset({
          ...parseLessonPreset(body),
          id: randomUUID(),
          version: 1,
        });
        return json({ preset }, { status: 201 });
      }
      const identity = parsePresetIdentity(body);
      if (request.method === "PUT") {
        const preset = await updateLessonPreset({ ...identity, ...parseLessonPreset(body) });
        if (!preset) throw new RequestError(409, "常用项已在其他设备修改或删除，请重新加载后重试");
        return json({ preset });
      }
      if (!(await deleteLessonPreset(identity.id, identity.version))) {
        throw new RequestError(409, "常用项已在其他设备修改或删除，请重新加载后重试");
      }
      return json({ deleted: true });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

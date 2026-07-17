import { createSessionCookie, verifyPassword } from "../../server/auth.js";
import {
  handleApiError,
  json,
  methodNotAllowed,
  readJson,
  RequestError,
  requireSameOrigin,
} from "../../server/http.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      requireSameOrigin(request);
      const body = await readJson(request);
      const password =
        typeof body === "object" && body !== null && "password" in body
          ? (body as { password?: unknown }).password
          : undefined;
      if (typeof password !== "string" || password.length > 1024 || !verifyPassword(password)) {
        throw new RequestError(401, "密码错误");
      }
      return json(
        { authenticated: true },
        { headers: { "Set-Cookie": createSessionCookie(request) } },
      );
    } catch (error) {
      return handleApiError(error);
    }
  },
};

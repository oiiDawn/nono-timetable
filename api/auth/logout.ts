import { clearSessionCookie } from "../../server/auth.js";
import { handleApiError, json, methodNotAllowed, requireSameOrigin } from "../../server/http.js";

export default {
  fetch(request: Request): Response {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      requireSameOrigin(request);
      return json(
        { authenticated: false },
        { headers: { "Set-Cookie": clearSessionCookie(request) } },
      );
    } catch (error) {
      return handleApiError(error);
    }
  },
};

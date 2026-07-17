import { calendarFeedToken, requireAuth } from "../server/auth.js";
import { handleApiError, json, methodNotAllowed } from "../server/http.js";

export default {
  fetch(request: Request): Response {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      requireAuth(request);
      const url = new URL(request.url);
      const calendarUrl = `${url.origin}/calendar/${encodeURIComponent(calendarFeedToken())}.ics`;
      return json({ calendarUrl });
    } catch (error) {
      return handleApiError(error);
    }
  },
};

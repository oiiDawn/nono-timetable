import { isAuthenticated } from "../../server/auth.js";
import { json, methodNotAllowed } from "../../server/http.js";

export default {
  fetch(request: Request): Response {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return json({ authenticated: isAuthenticated(request) });
  },
};

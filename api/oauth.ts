/** OAuth protocol endpoints and session-protected consent/connection management. */
import { oauthHandler } from "../server/oauth.js";
export default { fetch: oauthHandler };

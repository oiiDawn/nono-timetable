/** Authenticated MCP transport entry point for external agents. */
import { mcpHandler } from "../server/mcp.js";
export default { fetch: mcpHandler };

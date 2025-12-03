import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callAgentTool } from "../../lib/agent";
import type { WorkerEnv } from "../../types/env";

/**
 * Registers the "list_tools" helper tool on the MCP server, which lists all currently registered tools.
 * Delegates to the LangGraph agent for the final list.
 * @param server 
 */
export function registerListToolsHelper(server: McpServer, env: WorkerEnv) {
	server.tool("list_tools", "Return every MCP tool currently registered on the server.", async () =>
		(callAgentTool(env, "list_tools", {}) as any),
	);
}

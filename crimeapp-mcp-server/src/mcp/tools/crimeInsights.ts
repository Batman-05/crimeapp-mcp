import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callAgentTool } from "../../lib/agent";
import type { WorkerEnv } from "../../types/env";

/**
 * Registers the "crime_insights" tool on the MCP server, allowing users to ask natural language questions about the
 * crime dataset. Logic is delegated to the LangGraph agent; the worker only proxies.
 * @param server
 * @param env
 */
export function registerCrimeInsightsTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"crime_insights",
		"Ask natural questions about the crime dataset. Returns a summary, plus SQL & rows.",
		{
			q: z.string().min(1),
			model: z.string().optional().transform(() => "gpt-4o-mini"),
			summarize: z.boolean().default(true),
			preview_limit: z.number().int().min(1).max(50).default(20),
		},
		async ({ q, model, summarize, preview_limit }) =>
			(callAgentTool(env, "crime_insights", { q, model, summarize, preview_limit }) as any),
	);
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkerEnv } from "../../types/env";
import { callAgentTool } from "../../lib/agent";

export function registerRecentDaySummaryTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"recent_day_summary",
		"Summarize incidents from the most recent reported day, including article links when available.",
		{
			limit: z.number().int().min(1).max(50).default(25),
		},
		async ({ limit }) => (callAgentTool(env, "recent_day_summary", { limit }) as any),
	);
}

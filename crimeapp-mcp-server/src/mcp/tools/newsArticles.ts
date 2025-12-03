import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkerEnv } from "../../types/env";
import { callAgentTool } from "../../lib/agent";

export function registerNewsArticlesTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"news_articles",
		"Fetch recent crime-related news articles and their related incidents from the CRIME_DB database.",
		{
			limit: z.number().int().min(1).max(50).default(10),
			since: z.string().datetime().optional(),
			query: z.string().optional(),
			sourceIds: z.array(z.coerce.number()).optional(),
			cityId: z.coerce.number().int().positive().optional(),
		},
		async ({ limit, since, query, sourceIds, cityId }) =>
			(callAgentTool(env, "news_articles", { limit, since, query, sourceIds, cityId }) as any),
	);
}

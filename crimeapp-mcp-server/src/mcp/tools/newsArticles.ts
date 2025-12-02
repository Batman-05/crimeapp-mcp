import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkerEnv } from "../../types/env";
import { fetchArticles } from "../../db/news";

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
		async ({ limit, since, query, sourceIds, cityId }) => {
			if (!env.CRIME_DB) {
				return { content: [{ type: "text", text: "CRIME_DB binding is absent." }], isError: true };
			}

			let articles;
			try {
				articles = await fetchArticles(env.CRIME_DB, { limit, since, query, sourceIds, cityId });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Failed to fetch articles: ${message}` }],
					isError: true,
				};
			}

			if (!articles.length) {
				return { content: [{ type: "text", text: "No articles found." }], metadata: { count: 0, articles: [] } };
			}

			const preview = articles
				.map((a) => {
					const related = a.relatedIncidents?.length ? ` [${a.relatedIncidents.length} related incidents]` : "";
					return `- ${a.title} (${a.publishedAt ?? "unknown date"}) -> ${a.url}${related}`;
				})
				.join("\n");

			return {
				content: [{ type: "text", text: `Found ${articles.length} articles:\n${preview}` }],
				metadata: { count: articles.length, articles },
			};
		},
	);
}

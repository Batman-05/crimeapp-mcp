import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOpenAiChatTool } from "./mcp/tools/openAiChat";
import { registerCrimeInsightsTool } from "./mcp/tools/crimeInsights";
import { registerNewsArticlesTool } from "./mcp/tools/newsArticles";
import { registerListToolsHelper } from "./mcp/tools/listTools";
import { registerRecentDaySummaryTool } from "./mcp/tools/recentDaySummary";
// import { isAuthorized } from "./lib/agent";
import { sanitizeSelect } from "./db/sql-guardrails";
import { fetchArticles } from "./db/news";
import type { WorkerEnv } from "./types/env";

/**
 * Main MCP agent class for the Crime app. 
 */
export class MyMCP extends McpAgent<WorkerEnv> {
	server = new McpServer({
		name: "Authless Crime Analyst",
		version: "1.0.5",
	});

	async init() {
		registerOpenAiChatTool(this.server, this.env);
		// registerCrimeInsightsResources(this.server);
		// registerCrimeInsightsPrompt(this.server);
		registerCrimeInsightsTool(this.server, this.env);
		registerNewsArticlesTool(this.server, this.env);
		registerRecentDaySummaryTool(this.server, this.env);
		registerListToolsHelper(this.server, this.env);
	}
}

/**
 * Cloudflare Worker fetch handler to serve the MCP server and SSE endpoints.
 */
export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/proxy/db/query" && request.method === "POST") {
			// if (!isAuthorized(request, env)) {
			// 	return new Response("Unauthorized", { status: 401 });
			// }
			if (!env.CRIME_DB) {
				return new Response("CRIME_DB binding is not configured.", { status: 500 });
			}
			try {
				const { sql, params } = (await request.json()) as {
					sql?: string;
					params?: Record<string, unknown>;
				};
				if (!sql || typeof sql !== "string") {
					return new Response("Missing SQL", { status: 400 });
				}
				const safeSql = sanitizeSelect(sql);
				let stmt = env.CRIME_DB.prepare(safeSql);
				if (params && Object.keys(params).length) {
					const names = [...safeSql.matchAll(/:\w+/g)].map((m) => m[0].slice(1));
					const values = names.map((n) => params[n]);
					stmt = stmt.bind(...values);
				}
				const res = await stmt.all();
				const rows = res.results ?? [];
				const columns = rows[0] ? Object.keys(rows[0]) : [];
				return Response.json({ rows, columns });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return new Response(`DB query failed: ${message}`, { status: 400 });
			}
		}

		if (url.pathname === "/proxy/news_articles" && request.method === "POST") {
			// if (!isAuthorized(request, env)) {
			// 	return new Response("Unauthorized", { status: 401 });
			// }
			if (!env.CRIME_DB) {
				return new Response("CRIME_DB binding is not configured.", { status: 500 });
			}
			try {
				let body: unknown = {};
				try {
					body = await request.json();
				} catch {
					body = {};
				}
				if (!body || typeof body !== "object") {
					return new Response("Invalid JSON body", { status: 400 });
				}
				const { limit = 10, since, query, sourceIds, cityId } = body as {
					limit?: number;
					since?: string;
					query?: string;
					sourceIds?: number[];
					cityId?: number;
				};
				const articles = await fetchArticles(env.CRIME_DB, {
					limit,
					since,
					query,
					sourceIds,
					cityId,
				});
				return Response.json({ count: articles.length, articles });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return new Response(`Failed to fetch articles: ${message}`, { status: 400 });
			}
		}

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};

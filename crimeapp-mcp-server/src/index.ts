import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOpenAiChatTool } from "./mcp/tools/openAiChat";
import { registerCrimeInsightsTool } from "./mcp/tools/crimeInsights";
import { registerListToolsHelper } from "./mcp/tools/listTools";
import type { WorkerEnv } from "./types/env";

/**
 * Main MCP agent class for the Crime app. 
 */
export class MyMCP extends McpAgent<WorkerEnv> {
	server = new McpServer({
		name: "Authless Crime Analyst",
		version: "1.0.0",
	});

	async init() {
		registerOpenAiChatTool(this.server, this.env);
		// registerCrimeInsightsResources(this.server);
		// registerCrimeInsightsPrompt(this.server);
		registerCrimeInsightsTool(this.server, this.env);
		registerListToolsHelper(this.server);
	}
}

/**
 * Cloudflare Worker fetch handler to serve the MCP server and SSE endpoints.
 */
export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};

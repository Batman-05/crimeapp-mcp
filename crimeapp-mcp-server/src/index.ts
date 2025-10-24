import type { DurableObjectState } from "cloudflare:workers";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type WorkerEnv = Env & {
	OPENAI_API_KEY?: string;
};

// Define our MCP agent with tools
export class MyMCP extends McpAgent<WorkerEnv> {
	private readonly openAiApiKey?: string;

	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	constructor(ctx: DurableObjectState, env: WorkerEnv) {
		super(ctx, env);
		this.openAiApiKey = env.OPENAI_API_KEY;
	}

	async init() {

		// OpenAI chat tool for querying models using the configured API key
		this.server.tool(
			"openai_chat",
			{
				model: z.string().default("gpt-4o-mini"),
				prompt: z.string().min(1),
				system: z.string().optional(),
				temperature: z.coerce.number().min(0).max(2).optional(),
				maxTokens: z.coerce.number().int().positive().optional(),
			},
			async ({ model, prompt, system, temperature, maxTokens }) => {
				if (!this.openAiApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "OPENAI_API_KEY is not configured in the environment bindings.",
							},
						],
						isError: true,
					};
				}

				try {
					const response = await fetch("https://api.openai.com/v1/chat/completions", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.openAiApiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model,
							messages: [
								...(system ? [{ role: "system", content: system }] : []),
								{ role: "user", content: prompt },
							],
							...(temperature !== undefined ? { temperature } : {}),
							...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
						}),
					});

					if (!response.ok) {
						const errorBody = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `OpenAI API error (${response.status}): ${errorBody}`,
								},
							],
							isError: true,
						};
					}

					const data: {
						choices?: Array<{ message?: { content?: string } }>;
					} = await response.json();

					const messageContent = data.choices?.[0]?.message?.content?.trim();

					if (!messageContent) {
						return {
							content: [
								{
									type: "text",
									text: "OpenAI API returned an empty response.",
								},
							],
							isError: true,
						};
					}

					return {
						content: [{ type: "text", text: messageContent }],
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return {
						content: [
							{
								type: "text",
								text: `Failed to call OpenAI API: ${message}`,
							},
						],
						isError: true,
					};
				}
			},
		);
	}
}

export default {
	fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
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

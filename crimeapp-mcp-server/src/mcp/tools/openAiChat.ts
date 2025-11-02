import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkerEnv } from "../../types/env";
import { callOpenAiChat } from "../../lib/openai";
import { resolveSecret } from "../../lib/secrets";
import type { ChatMessage } from "../../lib/types";

/**
 * Registers the OpenAI Chat tool with the MCP server.
 * Once registered , the agent can use this tool to perform general-purpose chat completions.
 * @param server 
 * @param env 
 */
export function registerOpenAiChatTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"openai_chat",
		"General-purpose chat completion using the configured OpenAI model. Use this for free-form questions, summaries, or other narrative replies that do not require querying the crime database.",
		{
			model: z.string().default("gpt-4o-mini"),
			prompt: z.string().min(1),
			system: z.string().optional(),
			temperature: z.coerce.number().min(0).max(2).optional(),
			maxTokens: z.coerce.number().int().positive().optional(),
		},
		async ({ model, prompt, system, temperature, maxTokens }) => {
			const apiKey = await resolveSecret(env.OPENAI_API_KEY);

			if (!apiKey) {
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
				const messages: ChatMessage[] = [
					...(system ? [{ role: "system", content: system } as ChatMessage] : []),
					{ role: "user", content: prompt },
				];

				const openAiResponse = await callOpenAiChat(apiKey, {
					model,
					messages,
					temperature,
					maxTokens,
				});

				return {
					content: [{ type: "text", text: openAiResponse }],
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text",
							text: message,
						},
					],
					isError: true,
				};
			}
		},
	);
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkerEnv } from "../../types/env";
import { callAgentTool } from "../../lib/agent";

/**
 * Registers the OpenAI Chat tool with the MCP server.
 * Once registered , the agent can use this tool to perform general-purpose chat completions.
 * @param server 
 * @param env 
 */
export function registerOpenAiChatTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"openai_chat",
		"General-purpose chat completion via the LangGraph agent.",
		{
			model: z.string().default("gpt-4o-mini"),
			prompt: z.string().min(1),
			system: z.string().optional(),
			temperature: z.coerce.number().min(0).max(2).optional(),
			maxTokens: z.coerce.number().int().positive().optional(),
		},
		async ({ model, prompt, system, temperature, maxTokens }) =>
			(callAgentTool(env, "openai_chat", { model, prompt, system, temperature, maxTokens }) as any),
	);
}

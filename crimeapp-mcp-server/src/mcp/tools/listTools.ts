import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type RegisteredTool = {
	name: string;
	title?: string;
	description?: string;
	enabled: boolean;
	inputSchema?: {
		shape?: Record<string, unknown>;
	};
};

/**
 * Registers the "list_tools" helper tool on the MCP server, which lists all currently registered tools.
 * This helps the agent discover what tools are available to it.
 * @param server 
 */
export function registerListToolsHelper(server: McpServer) {
	server.tool("list_tools", "Return every MCP tool currently registered on the server.", async () => {
		const registry = (server as unknown as { _registeredTools?: Record<string, RegisteredTool> })._registeredTools ?? {};

		const tools = Object.entries(registry)
			.filter(([, tool]) => tool?.enabled !== false)
			.map(([name, tool]) => {
				const parameters =
					tool?.inputSchema && typeof tool.inputSchema === "object" && tool.inputSchema.shape
						? Object.keys(tool.inputSchema.shape)
						: [];

				return {
					name,
					title: tool?.title,
					description: tool?.description,
					parameters,
				};
			});

		const summary =
			tools.length > 0
				? tools
						.map((tool) => {
							const headline = `- ${tool.name}${tool.title ? ` — ${tool.title}` : ""}`;
							const details = tool.description ? `    • ${tool.description}` : undefined;
							const params = tool.parameters.length > 0 ? `    • params: ${tool.parameters.join(", ")}` : undefined;
							return [headline, details, params].filter(Boolean).join("\n");
						})
						.join("\n")
				: "No tools are currently registered.";

		return {
			content: [
				{
					type: "text" as const,
					text: `Available MCP tools (${tools.length}):\n${summary}`,
				},
			],
			metadata: {
				count: tools.length,
				tools,
			},
		};
	});
}

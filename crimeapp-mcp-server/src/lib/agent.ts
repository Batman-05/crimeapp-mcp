import type { WorkerEnv } from "../types/env";

// Relaxed shape to satisfy MCP tool return typing.
type AgentResponse = {
	content?: Array<{
		type: string;
		text?: string;
		data?: string;
		mimeType?: string;
		_meta?: Record<string, unknown>;
		[key: string]: unknown;
	}>;
	metadata?: unknown;
	isError?: boolean;
	[key: string]: unknown;
};

function buildAuthHeaders(env: WorkerEnv): Record<string, string> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (env.AGENT_SHARED_SECRET) {
		headers.Authorization = `Bearer ${env.AGENT_SHARED_SECRET}`;
	}
	return headers;
}

export async function callAgentTool(env: WorkerEnv, toolName: string, payload: unknown): Promise<AgentResponse> {
	if (!env.LANG_AGENT_URL) {
		throw new Error("LANG_AGENT_URL is not configured on the worker.");
	}

	const response = await fetch(`${env.LANG_AGENT_URL}/tools/${toolName}`, {
		method: "POST",
		headers: buildAuthHeaders(env),
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const message = await response.text();
		throw new Error(`Agent tool call failed (${response.status}): ${message}`);
	}

	return (await response.json()) as AgentResponse;
}

export function isAuthorized(request: Request, env: WorkerEnv): boolean {
	const required = env.AGENT_SHARED_SECRET;
	if (!required) return true;
	const auth = request.headers.get("authorization") ?? "";
	return auth === `Bearer ${required}`;
}

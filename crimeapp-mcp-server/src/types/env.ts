import type { MaybeSecretBinding } from "../lib/secrets";

/**
 * Environment bindings for the MCP worker in Cloudflare Workers.
 */
export type WorkerEnv = Env & {
	CRIME_DB?: D1Database;
	OPENAI_API_KEY?: MaybeSecretBinding;
	POLICY_AUD?: MaybeSecretBinding;
	TEAM_DOMAIN?: MaybeSecretBinding;
	LANG_AGENT_URL?: string;
	AGENT_SHARED_SECRET?: string;
};

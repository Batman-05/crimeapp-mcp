import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { planSqlFromQuery } from "../../db/planner";
import { sanitizeSelect } from "../../db/sql-guardrails";
import { callOpenAiChat } from "../../lib/openai";
import { resolveSecret } from "../../lib/secrets";
import type { WorkerEnv } from "../../types/env";
import { DEFAULT_CRIME_DB_SCHEMA } from "../../db/crimeDatabase";

const ALLOWED_OPENAI_MODELS = new Set(["gpt-4o-mini"]);


/**
 * Registers the "crime_insights" tool on the MCP server, allowing users to ask natural language questions about the
 * crime dataset.
 * @param server 
 * @param env 
 */
export function registerCrimeInsightsTool(server: McpServer, env: WorkerEnv) {
	server.tool(
		"crime_insights",
		"Ask natural questions about the crime dataset. Returns a summary, plus SQL & rows.",
    {
      q: z.string().min(1),
      model: z.string().optional().transform(() => "gpt-4o-mini"),
      summarize: z.boolean().default(true),
			preview_limit: z.number().int().min(1).max(50).default(20),
		},
		async ({ q, model, summarize, preview_limit }) => {
			const apiKey = await resolveSecret(env.OPENAI_API_KEY);
			const crimeDb = env.CRIME_DB;
			const effectiveModel = model?.trim() || "gpt-4o-mini"; // overkill but ensures model is set to at least gpt-4o-mini

			if (!crimeDb) {
				return {
					content: [
						{
              type: "text",
              text: "CRIME_DB binding is not configured; unable to query the incidents dataset.",
            },
          ],
          isError: true,
				};
			}

			if (!ALLOWED_OPENAI_MODELS.has(effectiveModel)) {
				return {
					content: [
						{
							type: "text",
							text: `Model "${effectiveModel}" is not supported for crime insights. Supported models: ${Array.from(ALLOWED_OPENAI_MODELS).join(", ")}`,
						},
					],
					isError: true,
				};
			}

			// Get schema JSON
			const schemaJson = JSON.stringify({ tables: DEFAULT_CRIME_DB_SCHEMA }, null, 2);

			// Plan the SQL query from the user question
			let plan;
			try {
				plan = apiKey
					? await planSqlFromQuery({ apiKey, userQuery: q, schemaJson })
					: { sql: "SELECT id, offence_summary FROM incidents ORDER BY id DESC LIMIT 20" };
			} catch (e) {
				return { content: [{ type: "text", text: `Planning failed: ${(e as Error).message}` }], isError: true };
			}

      // 3) Enforce safety
      let sql: string;
      try {
        sql = sanitizeSelect(plan.sql);
      } catch (e) {
        return { content: [{ type: "text", text: `SQL rejected: ${(e as Error).message}` }], isError: true };
      }

      // Execute with named params (if provided)
      try {
        let stmt = crimeDb.prepare(sql);
        if (plan.params && Object.keys(plan.params).length) {
          // bind named parameters like :p1, :p2 to their values from plan.params
          const names = [...sql.matchAll(/:\w+/g)].map(m => m[0].slice(1)); // ["p1","p2",...]
          const values = names.map(n => plan.params![n]);
          stmt = stmt.bind(...values);
        }
        const res = await stmt.all();
        const rows = res.results ?? [];
        const columns = rows[0] ? Object.keys(rows[0]) : [];
        const preview = rows.slice(0, preview_limit);

        // Summarize the results
		if (!summarize || !apiKey) {
			return {
				content: [
					{ type: "text", text: `Rows: ${rows.length}\n\nSQL:\n${sql}\n\nPreview:\n${JSON.stringify(preview, null, 2)}` },
				],
				metadata: { sql, rowCount: rows.length, columns, model: effectiveModel },
			};
		}
        // Summary prompt is used to generate a concise answer from the query results
        const summaryPrompt = [
          `Question: ${q}`,
          plan.explain ? `Planner notes: ${plan.explain}` : undefined,
          `SQL:\n${sql}`,
          `Returned rows: ${rows.length} (showing first ${preview.length})`,
          JSON.stringify(preview, null, 2),
          "Write a concise, factual answer. Include concrete counts and time ranges if present.",
			].filter(Boolean).join("\n\n");

			const summary = await callOpenAiChat(apiKey, {
				model: effectiveModel,
				messages: [
					{ role: "system", content: "You are a precise crime analyst." },
					{ role: "user", content: summaryPrompt },
				],
				temperature: 0.2,
        });

			return {
				content: [{ type: "text", text: summary }],
				metadata: { sql, rowCount: rows.length, columns, model: effectiveModel },
			};
		} catch (e) {
			return {
				content: [{ type: "text", text: `Query failed: ${(e as Error).message}\n\nSQL:\n${sql}` }],
				isError: true,
        };
      }
    },
  );
}


import { callOpenAiChat } from "../lib/openai";
import { resolveSecret } from "../lib/secrets";

type Plan = { sql: string; params?: Record<string, unknown>; explain?: string };

// The JSON Schema that the planner must adhere to in its response 
const PLANNER_SCHEMA_JSON = `{
  "type": "object",
  "properties": {
    "sql": { "type": "string", "description": "A single read-only SELECT for SQLite. Use named parameters like :p1" },
    "params": { "type": "object", "additionalProperties": true },
    "explain": { "type": "string" }
  },
  "required": ["sql"]
}`;

export async function planSqlFromQuery({
  apiKey,
  userQuery,
  schemaJson,
}: {
  apiKey: string;
  userQuery: string;
  schemaJson: string; // dynamic schema JSON string
}): Promise<Plan> {
  const system = [
    "You translate natural-language questions into SAFE SQLite SELECT queries for Cloudflare D1.",
    "Rules:",
    " - Return STRICT JSON matching the schema below, nothing else.",
    " - Read-only: SELECT only. No PRAGMA/ATTACH/CREATE/INSERT/UPDATE/DELETE.",
    " - Always include a LIMIT (<= 1000).",
    " - Prefer named parameters (:p1, :p2) instead of string concatenation.",
    " - Dates: use SQLite date/julianday with 'now' (e.g., julianday('now','-30 day')).",
  ].join("\n");

  const user = [
    "User question:",
    userQuery,
    "",
    "SQLite schema (JSON):",
    schemaJson,
    "",
    "Return JSON per this JSON Schema:",
    PLANNER_SCHEMA_JSON,
  ].join("\n");

  const raw = await callOpenAiChat(apiKey, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });

  // Ensure strict JSON
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Planner did not return JSON.");
  const json = raw.slice(start, end + 1);
  const plan = JSON.parse(json) as Plan;

  return plan;
}

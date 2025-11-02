const SQL_SELECT_PATTERN = /^\s*(?:with\b[\s\S]*?\bselect\b|select\b)/i;
const MUTATING_KEYWORDS = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|attach|detach|pragma|vacuum)\b/i;

export function sanitizeSelect(sql: string): string {
  let s = sql.trim().replace(/;+$/g, "");
  if (!SQL_SELECT_PATTERN.test(s)) throw new Error("Only SELECT queries are allowed.");
  if (MUTATING_KEYWORDS.test(s)) throw new Error("Mutating SQL is not allowed.");
  if (!/\blimit\s+\d+\b/i.test(s)) s = `${s}\nLIMIT 1000`;
  return s;
}

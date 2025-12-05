import json
import re
from typing import Any, Dict, List, Optional

import requests
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from src.config import MCP_BASE_URL, MCP_GATEWAY_TOKEN, OPENAI_API_KEY

# Types for structured return values
ArticleSummary = Dict[str, Any]
IncidentSummary = Dict[str, Any]

DEFAULT_CRIME_DB_SCHEMA: List[Dict[str, Any]] = [
    {
        "name": "incidents",
        "description": "One row per reported incident sourced from the municipal JSON feed.",
        "columns": [
            {"name": "id", "type": "integer", "description": "Primary key assigned when the row is inserted."},
            {"name": "layer_id", "type": "integer", "description": "Identifier of the upstream layer the feature originated from."},
            {"name": "object_id", "type": "integer", "description": "Source OBJECTID value."},
            {"name": "go_number", "type": "text", "description": "Incident number from the source system."},
            {"name": "offence_summary", "type": "text", "description": "Summary description for the incident."},
            {"name": "offence_category", "type": "text", "description": "Categorized offence type."},
            {"name": "time_of_day", "type": "text", "description": "Bucketed time of day description."},
            {"name": "week_day", "type": "text", "description": "Weekday on which the incident occurred."},
            {"name": "intersection", "type": "text", "description": "Nearest intersection based on the data feed."},
            {"name": "neighbourhood", "type": "text", "description": "Neighbourhood label reported by the feed."},
            {"name": "sector", "type": "text", "description": "Sector identifier used by local police reporting."},
            {"name": "division", "type": "text", "description": "Police division or precinct reported for the incident."},
            {"name": "ward", "type": "text", "description": "Municipal ward identifier."},
            {"name": "reported_date", "type": "text", "description": "Date the incident was reported (string format from source)."},
            {"name": "reported_year", "type": "text", "description": "Reported year string."},
            {"name": "reported_hour", "type": "text", "description": "Reported hour string."},
            {"name": "occurred_date", "type": "text", "description": "Date the incident occurred (string format from source)."},
            {"name": "occurred_year", "type": "text", "description": "Occurred year string."},
            {"name": "occurred_hour", "type": "text", "description": "Occurred hour string."},
            {"name": "x", "type": "real", "description": "Projected X coordinate supplied by the dataset."},
            {"name": "y", "type": "real", "description": "Projected Y coordinate supplied by the dataset."},
        ],
    },
    {
        "name": "article",
        "description": "News articles that may be related to incidents.",
        "columns": [
            {"name": "article_id", "type": "integer", "description": "Primary key for the article."},
            {"name": "source_id", "type": "integer", "description": "News source identifier."},
            {"name": "url_canonical", "type": "text", "description": "Canonical article URL."},
            {"name": "url_landing", "type": "text", "description": "Landing page URL if different."},
            {"name": "title", "type": "text", "description": "Article headline."},
            {"name": "byline", "type": "text", "description": "Author/byline text."},
            {"name": "published_at", "type": "text", "description": "Publication timestamp (ISO string)."},
            {"name": "fetched_at", "type": "text", "description": "Time the article was ingested."},
            {"name": "body_text", "type": "text", "description": "Full article body text."},
            {"name": "body_sha256", "type": "text", "description": "Hash of the article body."},
            {"name": "main_image_url", "type": "text", "description": "Primary image URL."},
            {"name": "is_paywalled", "type": "integer", "description": "1 if paywalled, else 0/null."},
            {"name": "city_id", "type": "integer", "description": "City identifier for the article."},
            {"name": "lat", "type": "real", "description": "Latitude if geocoded."},
            {"name": "lng", "type": "real", "description": "Longitude if geocoded."},
            {"name": "geocell", "type": "text", "description": "Geospatial cell identifier."},
            {"name": "entities_json", "type": "text", "description": "JSON of extracted entities."},
            {"name": "categories", "type": "text", "description": "Comma-separated category labels."},
        ],
    },
    {
        "name": "incident_article_link",
        "description": "Links articles to incidents with match scores and methods.",
        "columns": [
            {"name": "link_id", "type": "integer", "description": "Primary key for the link."},
            {"name": "incident_id", "type": "integer", "description": "FK to incidents.id."},
            {"name": "article_id", "type": "integer", "description": "FK to article.article_id."},
            {"name": "match_score", "type": "real", "description": "Confidence score for the link."},
            {"name": "method", "type": "text", "description": "How the link was generated (manual/heuristic/llm)."},
            {"name": "created_at", "type": "text", "description": "Timestamp when the link was created."},
        ],
    }
]

SQL_SELECT_PATTERN = re.compile(r"^\s*(?:with\b[\s\S]*?\bselect\b|select\b)", re.IGNORECASE)
MUTATING_KEYWORDS = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|attach|detach|pragma|vacuum)\b",
    re.IGNORECASE,
)

PLANNER_SCHEMA_JSON = """{
  "type": "object",
  "properties": {
    "sql": { "type": "string", "description": "A single read-only SELECT for SQLite. Use named parameters like :p1" },
    "params": { "type": "object", "additionalProperties": true },
    "explain": { "type": "string" }
  },
  "required": ["sql"]
}"""


def _sanitize_select(sql: str) -> str:
    """Enforce read-only SELECT queries with a LIMIT."""
    s = sql.strip().rstrip(";")
    if not SQL_SELECT_PATTERN.match(s):
        raise ValueError("Only SELECT queries are allowed.")
    if MUTATING_KEYWORDS.search(s):
        raise ValueError("Mutating SQL is not allowed.")
    if not re.search(r"\blimit\s+\d+\b", s, flags=re.IGNORECASE):
        s = f"{s}\nLIMIT 1000"
    return s


def _plan_sql_from_query(user_query: str, schema_json: str, model: str = "gpt-4o-mini") -> Dict[str, Any]:
    system = "\n".join(
        [
            "You translate natural-language questions into SAFE SQLite SELECT queries for Cloudflare D1.",
            "Rules:",
            " - Return STRICT JSON matching the schema below, nothing else.",
            " - Read-only: SELECT only. No PRAGMA/ATTACH/CREATE/INSERT/UPDATE/DELETE.",
            " - Always include a LIMIT (<= 1000).",
            " - Prefer named parameters (:p1, :p2) instead of string concatenation.",
            " - Dates: use SQLite date/julianday with 'now' (e.g., julianday('now','-30 day')).",
            " - To connect articles with incidents, join incident_article_link (incident_id -> incidents.id, article_id -> article.article_id).",
        ]
    )

    user = "\n".join(
        [
            "User question:",
            user_query,
            "",
            "SQLite schema (JSON):",
            schema_json,
            "",
            "Return JSON per this JSON Schema:",
            PLANNER_SCHEMA_JSON,
        ]
    )

    llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY, temperature=0.2)
    raw = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
    if not hasattr(raw, "content") or not isinstance(raw.content, str):
        raise ValueError("Planner did not return text content.")

    text = raw.content
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Planner did not return JSON.")
    json_str = text[start : end + 1]
    return json.loads(json_str)


def _call_worker(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if MCP_GATEWAY_TOKEN:
        headers["Authorization"] = f"Bearer {MCP_GATEWAY_TOKEN}"
    url = f"{MCP_BASE_URL}{path}"
    response = requests.post(url, json=payload, headers=headers, timeout=30)
    if not response.ok:
        raise RuntimeError(f"Worker call failed ({response.status_code}): {response.text}")
    return response.json()


def _run_db_query(sql: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return _call_worker("/proxy/db/query", {"sql": sql, "params": params or {}})


def _fetch_news_articles(payload: Dict[str, Any]) -> Dict[str, Any]:
    return _call_worker("/proxy/news_articles", payload)


def openai_chat_service(
    prompt: str,
    model: str = "gpt-4o-mini",
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY, temperature=temperature)
    messages: List[Any] = []
    if system:
        messages.append(SystemMessage(content=system))
    messages.append(HumanMessage(content=prompt))
    result = llm.invoke(messages, max_tokens=max_tokens)
    text = result.content if isinstance(result.content, str) else str(result.content)
    return {"content": [{"type": "text", "text": text}]}


def crime_insights_service(
    q: str,
    model: str = "gpt-4o-mini",
    summarize: bool = True,
    preview_limit: int = 20,
) -> Dict[str, Any]:
    if preview_limit < 1 or preview_limit > 50:
        return {"content": [{"type": "text", "text": "preview_limit must be between 1 and 50."}], "isError": True}

    schema_json = json.dumps({"tables": DEFAULT_CRIME_DB_SCHEMA}, indent=2)

    try:
        plan = _plan_sql_from_query(q, schema_json, model=model)
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Planning failed: {exc}"}], "isError": True}

    try:
        sql = _sanitize_select(plan.get("sql", ""))
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"SQL rejected: {exc}"}], "isError": True}

    try:
        query_res = _run_db_query(sql, plan.get("params"))
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Query failed: {exc}\n\nSQL:\n{sql}"}], "isError": True}

    rows: List[Dict[str, Any]] = query_res.get("rows", [])
    columns: List[str] = query_res.get("columns", [])
    preview = rows[:preview_limit]

    if not summarize:
        return {
            "content": [
                {"type": "text", "text": f"Rows: {len(rows)}\n\nSQL:\n{sql}\n\nPreview:\n{json.dumps(preview, indent=2)}"}
            ],
            "metadata": {"sql": sql, "rowCount": len(rows), "columns": columns, "model": model},
        }

    summary_prompt_parts = [
        f"Question: {q}",
        f"SQL:\n{sql}",
        f"Returned rows: {len(rows)} (showing first {len(preview)})",
        json.dumps(preview, indent=2),
        "Write a concise, factual answer. Include concrete counts and time ranges if present.",
    ]
    if plan.get("explain"):
        summary_prompt_parts.insert(1, f"Planner notes: {plan['explain']}")

    llm = ChatOpenAI(model=model, api_key=OPENAI_API_KEY, temperature=0.2)
    summary_msg = llm.invoke(
        [
            SystemMessage(content="You are a precise crime analyst."),
            HumanMessage(content="\n\n".join(summary_prompt_parts)),
        ]
    )
    summary_text = summary_msg.content if isinstance(summary_msg.content, str) else str(summary_msg.content)

    return {
        "content": [{"type": "text", "text": summary_text}],
        "metadata": {"sql": sql, "rowCount": len(rows), "columns": columns, "model": model},
    }


def news_articles_service(
    limit: int = 10,
    since: Optional[str] = None,
    query: Optional[str] = None,
    sourceIds: Optional[List[int]] = None,
    cityId: Optional[int] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"limit": limit}
    if since:
        payload["since"] = since
    if query:
        payload["query"] = query
    if sourceIds:
        payload["sourceIds"] = sourceIds
    if cityId is not None:
        payload["cityId"] = cityId

    try:
        data = _fetch_news_articles(payload)
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Failed to fetch articles: {exc}"}], "isError": True}

    articles = data.get("articles", [])
    if not articles:
        return {"content": [{"type": "text", "text": "No articles found."}], "metadata": {"count": 0, "articles": []}}

    preview_lines = []
    for article in articles:
        related = article.get("relatedIncidents") or []
        related_hint = f" [{len(related)} related incidents]" if related else ""
        preview_lines.append(
            f"- {article.get('title')} ({article.get('publishedAt') or 'unknown date'}) -> {article.get('url')}{related_hint}"
        )

    return {
        "content": [{"type": "text", "text": f"Found {len(articles)} articles:\n" + "\n".join(preview_lines)}],
        "metadata": {"count": len(articles), "articles": articles},
    }


def recent_day_summary_service(limit: int = 25) -> Dict[str, Any]:
    """
    Return a summary of incidents from the most recent reported day, including any linked article.
    """
    try:
        safe_limit = max(1, min(int(limit), 200))
         
        latest_res = _run_db_query(
            """
            SELECT MAX(reported_date) AS latest_date
            FROM incidents
            WHERE reported_date IS NOT NULL
            """
        )
        latest_date = None
        if latest_res.get("rows"):
            latest_date = latest_res["rows"][0].get("latest_date")
        if not latest_date:
            return {"content": [{"type": "text", "text": "No incidents found."}], "metadata": {"count": 0}}

        incidents_res = _run_db_query(
            f"""
            WITH latest AS (
                SELECT MAX(reported_date) AS d
                FROM incidents
                WHERE reported_date IS NOT NULL
            )
            SELECT
                i.id AS incident_id,
                i.reported_date,
                i.neighbourhood,
                COALESCE(i.offence_summary, i.offence_category) AS crime_type,
                a.title AS article_title,
                COALESCE(a.url_canonical, a.url_landing) AS article_url,
                l.match_score,
                l.method
            FROM incidents i
            CROSS JOIN latest
            LEFT JOIN incident_article_link l ON l.incident_id = i.id
            LEFT JOIN article a ON a.article_id = l.article_id
            WHERE i.reported_date = latest.d
            ORDER BY i.reported_date DESC, i.id DESC, COALESCE(l.match_score, 0) DESC
            LIMIT {safe_limit}
            """
        )

        rows: List[IncidentSummary] = incidents_res.get("rows", [])
        if not rows:
            return {
                "content": [{"type": "text", "text": f"No incidents found on {latest_date}."}],
                "metadata": {"count": 0, "latestDate": latest_date},
            }

        lines: List[str] = []
        for row in rows:
            article_hint = ""
            if row.get("article_url"):
                article_hint = f" | article: {row.get('article_url')}"
            lines.append(
                f"- {row.get('reported_date') or latest_date} | {row.get('neighbourhood') or 'Unknown area'} | "
                f"{row.get('crime_type') or 'Unknown crime'}{article_hint}"
            )

        return {
            "content": [
                {
                    "type": "text",
                    "text": f"Most recent day ({latest_date}) incidents ({len(rows)} shown):\n" + "\n".join(lines),
                }
            ],
            "metadata": {"count": len(rows), "latestDate": latest_date, "incidents": rows},
        }
    except Exception as exc:
        return {"content": [{"type": "text", "text": f"Failed to build summary: {exc}"}], "isError": True}


def list_tools_service() -> Dict[str, Any]:
    tools = [
        {"name": "crime_insights", "description": "Ask natural questions about the crime dataset."},
        {"name": "news_articles", "description": "Fetch recent crime-related news articles from CRIME_DB."},
        {"name": "recent_day_summary", "description": "Summarize incidents from the most recent reported day with article links if available."},
        {"name": "openai_chat", "description": "General-purpose chat completion via the agent."},
        {"name": "list_tools", "description": "List tools currently available to the agent."},
    ]
    summary = "\n".join(f"- {tool['name']} • {tool['description']}" for tool in tools)
    return {
        "content": [{"type": "text", "text": f"Available tools ({len(tools)}):\n{summary}"}],
        "metadata": {"count": len(tools), "tools": tools},
    }

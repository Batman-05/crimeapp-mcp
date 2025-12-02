from typing import Any

from langchain.tools import tool

from src.mcp_client.client import call_mcp_tool


def _omit_none(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a copy without None values so Zod optional fields pass validation."""
    return {k: v for k, v in payload.items() if v is not None}


@tool
def crime_insights(
    q: str,
    model: str = "gpt-4o-mini",
    summarize: bool = True,
    preview_limit: int = 20,
) -> Any:
    """Ask natural questions about the crime dataset."""
    payload = {
        "q": q,
        "model": model,
        "summarize": summarize,
        "preview_limit": preview_limit,
    }
    return call_mcp_tool("crime_insights", payload)


@tool
def news_articles(
    limit: int = 10,
    since: str | None = None,
    query: str | None = None,
    sourceIds: list[int] | None = None,
) -> Any:
    """Fetch recent crime-related news articles from CRIME_DB."""
    payload = _omit_none(
        {
            "limit": limit,
            "since": since,
            "query": query,
            "sourceIds": sourceIds,
        }
    )
    return call_mcp_tool("news_articles", payload)


@tool
def list_tools() -> Any:
    """List MCP tools currently registered on the server."""
    return call_mcp_tool("list_tools", {})


@tool
def openai_chat(
    prompt: str,
    model: str = "gpt-4o-mini",
    system: str | None = None,
    temperature: float | None = None,
    maxTokens: int | None = None,
) -> Any:
    """General-purpose chat completion via the MCP server."""
    payload = _omit_none(
        {
            "model": model,
            "prompt": prompt,
            "system": system,
            "temperature": temperature,
            "maxTokens": maxTokens,
        }
    )
    return call_mcp_tool("openai_chat", payload)

from typing import Any, Optional

from langchain.tools import tool

from src.agent import services


def _omit_none(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a copy without None values so optional fields pass validation."""
    return {k: v for k, v in payload.items() if v is not None}


@tool
def crime_insights(
    q: str,
    model: str = "gpt-4o-mini",
    summarize: bool = True,
    preview_limit: int = 20,
) -> Any:
    """Ask natural questions about the crime dataset."""
    return services.crime_insights_service(q=q, model=model, summarize=summarize, preview_limit=preview_limit)


@tool
def news_articles(
    limit: int = 10,
    since: Optional[str] = None,
    query: Optional[str] = None,
    sourceIds: Optional[list[int]] = None,
    cityId: Optional[int] = None,
) -> Any:
    """Fetch recent crime-related news articles from CRIME_DB."""
    payload = _omit_none(
        {
            "limit": limit,
            "since": since,
            "query": query,
            "sourceIds": sourceIds,
            "cityId": cityId,
        }
    )
    return services.news_articles_service(**payload)


@tool
def list_tools() -> Any:
    """List tools currently available to the agent."""
    return services.list_tools_service()


@tool
def openai_chat(
    prompt: str,
    model: str = "gpt-4o-mini",
    system: Optional[str] = None,
    temperature: Optional[float] = None,
    maxTokens: Optional[int] = None,
) -> Any:
    """General-purpose chat completion via the agent."""
    payload = _omit_none(
        {
            "model": model,
            "prompt": prompt,
            "system": system,
            "temperature": temperature,
            "max_tokens": maxTokens,
        }
    )
    return services.openai_chat_service(**payload)

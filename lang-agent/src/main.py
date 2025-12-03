from fastapi import FastAPI
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from src.agent.graph import app as graph_app
from src.agent import services

class Query(BaseModel):
    query: str

class OpenAIChatPayload(BaseModel):
    prompt: str
    model: str = "gpt-4o-mini"
    system: str | None = None
    temperature: float | None = None
    maxTokens: int | None = None

class CrimeInsightsPayload(BaseModel):
    q: str
    model: str = "gpt-4o-mini"
    summarize: bool = True
    preview_limit: int = 20

class NewsArticlesPayload(BaseModel):
    limit: int = 10
    since: str | None = None
    query: str | None = None
    sourceIds: list[int] | None = None
    cityId: int | None = None

api = FastAPI()

@api.post("/agent/query")
async def query_agent(payload: Query):
    initial_state = {"messages": [HumanMessage(content=payload.query)]}
    result = graph_app.invoke(initial_state)
    final_msg = result["messages"][-1]
    return {"answer": final_msg.content}

@api.post("/tools/openai_chat")
async def tool_openai_chat(payload: OpenAIChatPayload):
    return services.openai_chat_service(
        prompt=payload.prompt,
        model=payload.model,
        system=payload.system,
        temperature=payload.temperature,
        max_tokens=payload.maxTokens,
    )

@api.post("/tools/crime_insights")
async def tool_crime_insights(payload: CrimeInsightsPayload):
    return services.crime_insights_service(
        q=payload.q,
        model=payload.model,
        summarize=payload.summarize,
        preview_limit=payload.preview_limit,
    )

@api.post("/tools/news_articles")
async def tool_news_articles(payload: NewsArticlesPayload):
    return services.news_articles_service(
        limit=payload.limit,
        since=payload.since,
        query=payload.query,
        sourceIds=payload.sourceIds,
        cityId=payload.cityId,
    )

@api.post("/tools/list_tools")
async def tool_list_tools():
    return services.list_tools_service()

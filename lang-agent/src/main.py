from fastapi import FastAPI
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from src.agent.graph import app as graph_app

class Query(BaseModel):
    query: str

api = FastAPI()

@api.post("/agent/query")
async def query_agent(payload: Query):
    initial_state = {"messages": [HumanMessage(content=payload.query)]}
    result = graph_app.invoke(initial_state)
    final_msg = result["messages"][-1]
    return {"answer": final_msg.content}

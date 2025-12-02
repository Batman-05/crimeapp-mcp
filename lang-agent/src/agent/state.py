from typing import Annotated, List, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Use add_messages so LangGraph appends new messages instead of replacing the list.
    messages: Annotated[List[AnyMessage], add_messages]

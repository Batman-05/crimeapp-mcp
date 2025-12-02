from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

from src.agent.state import AgentState
from src.agent.tools import crime_insights, list_tools, news_articles, openai_chat
from src.config import OPENAI_API_KEY

# Langraph creates our agent graph by connecting LLM and Tool nodes
# The agent graph is like the agent but structured as a graph of nodes and edges 
# its easier to visualize and reason about the flow of information in the agent 
# compared to the more traditional agent structure

llm = ChatOpenAI(model="gpt-4o-mini", api_key=OPENAI_API_KEY) # gpt-4.1-mini
tools = [crime_insights, news_articles, list_tools, openai_chat]
llm_with_tools = llm.bind_tools(tools)

def agent_node(state: AgentState) -> AgentState:
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

tool_node = ToolNode(tools)

def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return END

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")

app = graph.compile()

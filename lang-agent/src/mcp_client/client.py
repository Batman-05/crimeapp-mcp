import asyncio
from typing import Any, Dict

from mcp.client.sse import sse_client
from mcp.client.session import ClientSession

from src.config import MCP_BASE_URL


async def _call_tool(tool_name: str, payload: Dict[str, Any]) -> Any:
    """
    Call an MCP tool using the MCP SSE transport exposed by the Worker (/sse).
    Returns the raw MCP tool response (content/metadata structure).
    """
    url = f"{MCP_BASE_URL}/sse"
    async with sse_client(url) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            return await session.call_tool(tool_name, arguments=payload)


def call_mcp_tool(tool_name: str, payload: Dict[str, Any]) -> Any:
    """
    Synchronous wrapper used by the agent tooling to call MCP tools.
    """
    return asyncio.run(_call_tool(tool_name, payload))

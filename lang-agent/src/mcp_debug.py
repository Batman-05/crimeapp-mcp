from src.mcp_client.client import call_mcp_tool

def main():
    # Quick connectivity check against the MCP server. This calls the helper tool
    # that enumerates all registered MCP tools.
    result = call_mcp_tool("list_tools", {})
    print("Available tools:", result)

    # Example call to the news articles tool (safe, no OpenAI dependency)
    news_preview = call_mcp_tool(
        "news_articles",
        {
            "limit": 3,
            "query": "ottawa",
        },
    )
    print("News tool sample:", news_preview)

if __name__ == "__main__":
    main()

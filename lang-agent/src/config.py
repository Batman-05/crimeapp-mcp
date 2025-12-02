import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MCP_BASE_URL = os.getenv("MCP_BASE_URL")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set")
if not MCP_BASE_URL:
    raise RuntimeError("MCP_BASE_URL not set")

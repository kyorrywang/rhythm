from tools.mcp.mcp_client import MCPClient


class MCPAdapter:
    def __init__(self, client: MCPClient | None = None) -> None:
        self.client = client or MCPClient()

    def as_tool(self, tool_name: str):
        def _call(arguments: dict):
            return self.client.call(tool_name, arguments)

        return _call

class MCPClient:
    def call(self, tool_name: str, arguments: dict) -> str:
        return f"MCP 模拟调用: {tool_name} {arguments}"

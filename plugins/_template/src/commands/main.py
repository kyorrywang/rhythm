import json
import os
import sys

from runtime_rpc import RuntimeRpcClient


rpc = RuntimeRpcClient()


def hello(input_value, _call):
    return {"message": input_value.get("message") or "Hello from a Python backend command."}


def shell_echo(input_value, _call):
    return rpc.execute_command(
        "tool.shell",
        {"command": f"echo {json.dumps(input_value.get('message') or 'hello')}"},
    )


HANDLERS = {
    "hello": hello,
    "shell_echo": shell_echo,
}


def main():
    handler_name = sys.argv[1] if len(sys.argv) > 1 else ""
    handler = HANDLERS.get(handler_name)
    if handler is None:
        raise RuntimeError(f"Unknown handler '{handler_name}'")
    call = json.loads(os.environ.get("RHYTHM_PLUGIN_CALL") or "{}")
    result = handler(call.get("input") or {}, call)
    print(json.dumps({"ok": True, "data": result}), end="")


if __name__ == "__main__":
    main()

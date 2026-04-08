import json
import sys
import time


class RuntimeRpcClient:
    def __init__(self):
        self._next_id = 0

    def execute_command(self, command_id, input_value=None):
        request_id = f"rpc_{int(time.time() * 1000)}_{self._next_id}"
        self._next_id += 1
        request = {
            "id": request_id,
            "method": "command.execute",
            "params": {
                "commandId": command_id,
                "input": input_value or {},
            },
        }
        print(json.dumps(request), flush=True)
        for line in sys.stdin:
            if not line.strip():
                continue
            message = json.loads(line)
            if message.get("id") != request_id:
                continue
            if message.get("ok") is False:
                error = message.get("error") or {}
                raise RuntimeError(error.get("message") or "Host command failed")
            return message.get("data")
        raise RuntimeError("Host command response stream closed")

"""Protocol-only fixture: no Harness home, model, network, or user credentials."""
import json
import os
import sys

def notify(method, params):
    print(json.dumps({"jsonrpc": "2.0", "method": method, "params": params}), flush=True)

for line in sys.stdin:
    message = json.loads(line)
    method = message["method"]
    if method == "initialize":
        result = {"serverInfo": {"name": "project-sources-projection"}}
    elif method == "session/prompt":
        session_id = message["params"]["sessionId"]
        for event in json.loads(os.environ["SOURCE_EVENTS"]):
            notify("session.event", {"sessionId": session_id, "event": event})
        notify("session.event", {"sessionId": session_id, "event": {"type": "agent/inbox/spliced", "seq": 1, "time": 0, "data": {"target": "next-turn", "start": 0, "inserted": [{"id": "accepted"}]}}})
        notify("session.status", {"sessionId": session_id, "status": "running"})
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": {"messageId": "accepted"}}), flush=True)
        notify("session.event", {"sessionId": session_id, "event": {"type": "turn/start", "seq": 2, "time": 0, "data": {"turn": 0}}})
        notify("session.event", {"sessionId": session_id, "event": {"type": "assistant/message", "seq": 3, "time": 0, "data": {"message": {"role": "assistant", "content": [{"type": "text", "text": os.environ["MAIN_RESPONSE"]}]}}}})
        notify("session.event", {"sessionId": session_id, "event": {"type": "turn/end", "seq": 4, "time": 0, "data": {"turn": 0, "reason": {"kind": "completed"}}}})
        notify("session.status", {"sessionId": session_id, "status": "idle"})
        continue
    elif method == "shutdown":
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": {}}), flush=True)
        break
    else:
        raise RuntimeError("Unexpected method")
    print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": result}), flush=True)

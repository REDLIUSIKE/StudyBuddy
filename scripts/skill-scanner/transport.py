"""Keyless private LLM handler. Prompts, finding conversion and severity remain upstream-owned."""
import json
import sys

OUTPUT = sys.stdout
INPUT = sys.stdin.buffer
MAX_FRAME = 8 * 1024 * 1024


def read_frame():
    raw = INPUT.readline(MAX_FRAME + 1)
    if not raw or len(raw) > MAX_FRAME or not raw.endswith(b"\n"):
        raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
    return value


def send_frame(value):
    raw = json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n"
    if len(raw.encode("utf-8")) > MAX_FRAME:
        raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
    OUTPUT.write(raw)
    OUTPUT.flush()


class PrivateJudge:
    def __init__(self, max_tokens):
        self.max_tokens = max_tokens
        self.sequence = 0
        self.last_usage = None

    async def make_request(self, messages, context=""):
        self.sequence += 1
        identity = str(self.sequence)
        self.last_usage = None
        send_frame({"kind": "judge", "id": identity, "messages": messages, "maxTokens": self.max_tokens})
        response = read_frame()
        if set(response) != {"kind", "id", "value"} or response["kind"] != "judge-result" or response["id"] != identity:
            raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
        value = response["value"]
        if not isinstance(value, dict) or set(value) != {"content", "usage"} or not isinstance(value["content"], str):
            raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
        usage = value["usage"]
        if not isinstance(usage, dict) or set(usage) != {"input_tokens", "output_tokens", "total_tokens"} or any(type(count) is not int or count < 0 for count in usage.values()):
            raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
        self.last_usage = usage
        return value["content"]

"""Run the real pinned scanner, with only its LLM transport replaced by the private parent pipe."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / "packages"), str(ROOT)]
from transport import PrivateJudge, read_frame, send_frame
from network import install_network_policy

# Neither the scanner nor its dependencies may fetch costs, rules, credentials or cloud analysis.
# Main alone owns permitted current-model network calls; the worker has no network credentials.
install_network_policy()
sys.stdout = sys.stderr


def main():
    initial = read_frame()
    if set(initial) != {"kind", "directory", "model"} or initial["kind"] != "scan" or not isinstance(initial["model"], str) or not Path(initial["directory"]).is_absolute():
        raise RuntimeError("SKILL_SAFETY_SCANNER_INVALID")
    from importlib.metadata import version
    from skill_scanner import SkillScanner
    from skill_scanner.core.analyzer_factory import build_analyzers
    from skill_scanner.core.scan_policy import ScanPolicy

    if version("cisco-ai-skill-scanner") != "2.2.2":
        raise RuntimeError("SKILL_SAFETY_RESOURCE_INVALID")
    policy = ScanPolicy.from_preset("balanced")
    analyzers = build_analyzers(policy, use_llm=True, llm_model=initial["model"], llm_provider="openai-compatible", llm_api_key="PRIVATE_PIPE_ONLY", llm_base_url="https://scanner.invalid")
    judges = [analyzer for analyzer in analyzers if analyzer.get_name() == "llm_analyzer"]
    if len(judges) != 1 or policy.adjudicator.enabled:
        raise RuntimeError("SKILL_SAFETY_RESOURCE_INVALID")
    judges[0].request_handler = PrivateJudge(judges[0].max_tokens)
    with SkillScanner(analyzers=analyzers, policy=policy) as scanner:
        result = scanner.scan_skill(Path(initial["directory"])).to_dict()
    send_frame({"kind": "result", "value": result})
    return 1 if result["max_severity"] in {"HIGH", "CRITICAL"} else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # A failed scan never emits a fabricated clean result or private exception text.
        sys.exit(2)

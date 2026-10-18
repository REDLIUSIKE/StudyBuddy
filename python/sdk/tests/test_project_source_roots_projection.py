"""Python projection only; native project preparation and permission tests own authority."""
import json
import sys
from pathlib import Path
from deepseek_harness import DeepSeekHarness

def test_required_project_roots_remain_exact_in_events_and_notifications(tmp_path: Path) -> None:
    expected = json.loads((Path(__file__).parent / "expected/project-source-roots.json").read_text(encoding="utf-8"))
    fixture = Path(__file__).parent / "fixtures/project_sources_runtime.py"
    with DeepSeekHarness(_launch_args=(sys.executable, str(fixture)), cwd=str(tmp_path),
                        env={"MAIN_RESPONSE": expected["finalResponse"], "SOURCE_EVENTS": json.dumps(expected["sourceEvents"])}) as harness:
        with harness.client.subscribe_session_notifications("sdk-project-sources") as subscription:
            result = harness.run("Project source projection only.", session_id="sdk-project-sources")
            notification = subscription.next()
            assert notification.method == "session.event"
            events = [notification.payload["event"]]
    assert {"finalResponse": result.final_response, "sourceEvents": events} == expected
    assert not any(event["type"] == "sandbox/workspace-roots" for event in result.events)
    assert not {"ignorable", "surfaceOp", "sourceEventSeqs"}.intersection(events[0])

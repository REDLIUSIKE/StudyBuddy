"""Keyless assembled SDK projection of the required native built-in audit event.

The existing SDK Node-launch resolver selects the actual dsh CLI and the model
boundary is its recorded replay adapter. This is not installed-wheel or native
single-executable acceptance; synthetic authority here proves event projection.
"""
from __future__ import annotations

import json
import os
import runpy
import shutil
import subprocess
from pathlib import Path

from deepseek_harness import DeepSeekHarness


ROOT = Path(__file__).resolve().parents[3]
SCENARIO = ROOT / "snapshots" / "sdk" / "builtin-request-audit"
EXPECTED = ROOT / "scripts" / "snapshots" / "python-sdk-single-exe" / "builtin-request-audit"


def test_required_native_audit_survives_python_sdk_and_durable_session(tmp_path: Path) -> None:
    node = shutil.which("node")
    assert node is not None, "assembled replay requires Node for the real dsh CLI"
    # Reuse the TypeScript SDK's shipped launch resolver, including its source
    # compatibility patch; do not invent a second runtime or TypeScript loader.
    patch_root = tmp_path / ".snapshot-patches"
    patch_root.mkdir()
    source_patches = [str(ROOT / "snapshots/sdk/text-turn/cordis.yml"),
                      str(ROOT / "snapshots/sdk/text-turn/cordis.snapshot.yml"),
                      str(SCENARIO / "runtime.cordis.yml")]
    query = (
        "import { resolveDshNodeLaunchFromManifests } from './packages/sdk/client/src/launch.ts';"
        "import { materializeProfilePatch } from './packages/test-support/session-snapshot/lib/index.js';"
        "const launch=resolveDshNodeLaunchFromManifests("
        "new URL('./apps/cli/package.json', import.meta.url).href,"
        "new URL('./packages/sdk/client/package.json', import.meta.url).href);"
        "const [cwd,patchRoot,sources]=process.argv.slice(1);"
        "launch.patches.push(...JSON.parse(sources).map((source,index)=>"
        "materializeProfilePatch(source,cwd,'sdk',patchRoot,index)));"
        "process.stdout.write(JSON.stringify(launch));"
    )
    resolved = subprocess.run(
        [node, "--input-type=module", "-e", query, str(tmp_path), str(patch_root), json.dumps(source_patches)], cwd=ROOT,
        check=True, text=True, encoding="utf-8", capture_output=True,
    )
    launch = json.loads(resolved.stdout)
    argv = [node, *launch["nodeArgs"], "--profile", "sdk"]
    for patch in launch["patches"]:
        argv.extend(("--patch", patch))
    home = tmp_path / ".dsh"
    helpers = runpy.run_path(str(ROOT / "scripts" / "smoke-python-runtime.py"))
    session_id = helpers["SNAPSHOT_SESSION_ID"]
    with DeepSeekHarness(
        _launch_args=tuple(argv), profile="sdk", dsh_home=str(home), cwd=str(tmp_path),
        provider="deepseek-official", model="deepseek-v4-flash", request_timeout_seconds=60,
        env={**launch["environment"], "DSH_HOME": str(home), "DSH_SNAPSHOT": "replay",
             "DSH_SNAPSHOT_FILE": str(SCENARIO / "session.v4.jsonl"),
             "DEEPSEEK_API_KEY": "",
             "DSH_TELEMETRY_DISABLED": "1", "DSH_SNAPSHOT_FEEDBACK": "0",
             "DSH_AGENTS_HOME": str(tmp_path / ".agents")},
    ) as harness:
        result = harness.run("Reply with exactly: SDK snapshot OK", session_id=session_id)
    assert result.final_response == "SDK snapshot OK"
    audit = [event for event in result.events if event["type"] == "studybuddy/builtin-request"]
    notifications = [entry.payload["event"] for entry in result.notifications
                     if entry.method == "session.event"
                     and entry.payload["event"]["type"] == "studybuddy/builtin-request"]
    logs = helpers["read_session_logs"](home / "sessions")
    durable = [event for event in logs[session_id] if event["type"] == "studybuddy/builtin-request"]
    assert len(audit) == 1
    assert audit == notifications == durable
    for event in audit:
        assert not {"ignorable", "surfaceOp", "sourceEventSeqs"}.intersection(event)
        text = json.dumps(event)
        assert "apiKey" not in text and "requestTicket" not in text and "Bearer " not in text
    files = helpers["build_snapshot_files"](result, logs, [], tmp_path)
    helpers["compare_snapshot_files"](
        files, os.environ.get("DSH_SNAPSHOT") == "refresh", EXPECTED,
        ("result.json", "session.v4.jsonl"), native_writer_output=True,
    )

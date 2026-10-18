"""Build-time-only wheel closure: official release pins, binary wheels, no host installation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

SCANNER_HASH = "c93db6dc5ca956e2224fa189bcb0837f0b9c3bc84d779a173856003886754f02"


def normalize(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--wheelhouse", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12) or sys.platform != "win32":
        raise RuntimeError("The locked target is CPython 3.12 Windows x64")
    raw = (args.evidence / "cisco-requirements.txt").read_text(encoding="utf-8")
    pins = {}
    for block in re.split(r"\n(?=[A-Za-z0-9])", raw):
        match = re.match(r"([A-Za-z0-9._-]+)==([^\s;\\]+)([^\n]*)", block)
        if match:
            pins[normalize(match[1])] = {"version": match[2], "line": match[0].rstrip(" \\"), "hashes": re.findall(r"--hash=sha256:([a-f0-9]{64})", block)}
    wheel = args.evidence / "cisco_ai_skill_scanner-2.2.2-cp311.cp312.cp313.cp314-none-win_amd64.whl"
    if hashlib.sha256(wheel.read_bytes()).hexdigest() != SCANNER_HASH:
        raise RuntimeError("The Cisco wheel does not match the official PyPI release digest")
    args.wheelhouse.mkdir(parents=True, exist_ok=True)
    console_archive = args.evidence / "win_unicode_console-0.5.zip"
    console_hash = "d4142d4d56d46f449d6f00536a73625a871cba040f0bc1a2e305a04578f07d1e"
    if hashlib.sha256(console_archive.read_bytes()).hexdigest() != console_hash:
        raise RuntimeError("The sole source-only dependency does not match the official release hash")
    with tempfile.TemporaryDirectory(prefix="skill-scanner-lock-") as temporary:
        constraints = Path(temporary) / "constraints.txt"
        constraints.write_text("\n".join(row["line"] for row in pins.values()) + "\n", encoding="utf-8")
        environment = {name: value for name, value in os.environ.items() if name.upper() in {"SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATH"}}
        environment.update({"PIP_CONFIG_FILE": os.devnull, "SOURCE_DATE_EPOCH": "1466812800"})
        # The inspected source-only MIT dependency is packaged at build time; user machines never run pip or setup.py.
        source = Path(temporary) / "console"
        with zipfile.ZipFile(console_archive) as archive:
            if any(name.startswith(("/", "\\")) or ".." in Path(name).parts for name in archive.namelist()):
                raise RuntimeError("Unsafe verified source archive")
            archive.extractall(source)
        subprocess.run([sys.executable, "-I", "-m", "pip", "wheel", "--no-build-isolation", "--no-deps", "--no-cache-dir", "--disable-pip-version-check", "--wheel-dir", str(args.wheelhouse.resolve()), str(source / "win_unicode_console-0.5")], check=True, env=environment, timeout=60)
        subprocess.run([sys.executable, "-I", "-m", "pip", "download", "--only-binary=:all:", "--no-cache-dir", "--disable-pip-version-check", "--index-url=https://pypi.org/simple", "--find-links", str(args.wheelhouse.resolve()), "--constraint", str(constraints), "--dest", str(args.wheelhouse), str(wheel)], check=True, env=environment, timeout=600)
    resources = []
    for file in sorted(args.wheelhouse.glob("*.whl")):
        with zipfile.ZipFile(file) as archive:
            metadata = archive.read(next(name for name in archive.namelist() if name.endswith(".dist-info/METADATA"))).decode("utf-8")
        name = re.search(r"^Name: (.+)$", metadata, re.M)[1].strip()
        version = re.search(r"^Version: (.+)$", metadata, re.M)[1].strip()
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if normalize(name) == "cisco-ai-skill-scanner":
            if version != "2.2.2" or digest != SCANNER_HASH:
                raise RuntimeError("Cisco identity changed")
        elif normalize(name) == "win-unicode-console" and version == "0.5":
            resources.append({"name": name, "version": version, "filename": file.name, "sha256": digest, "size": file.stat().st_size, "builtFrom": {"url": "https://files.pythonhosted.org/packages/89/8d/7aad74930380c8972ab282304a2ff45f3d4927108bb6693cabcc9fc6a099/win_unicode_console-0.5.zip", "sha256": console_hash, "size": 31420, "setuptools": "84.0.0", "wheel": "0.48.0", "sourceDateEpoch": 1466812800}})
            continue
        elif normalize(name) not in pins or version != pins[normalize(name)]["version"] or digest not in pins[normalize(name)]["hashes"]:
            raise RuntimeError(f"{file.name}: downloaded wheel is not in the official release hash closure")
        # No inherited authorization, cookies, proxies or Git credentials are used.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"https://pypi.org/pypi/{name}/{version}/json", timeout=30) as response:
            published = json.load(response)
        match = next(row for row in published["urls"] if row["filename"] == file.name and row["digests"]["sha256"] == digest)
        resources.append({"name": name, "version": version, "filename": file.name, "url": match["url"], "sha256": digest, "size": file.stat().st_size})
    output = {"schemaVersion": 1, "checkedAt": "2026-10-13", "target": "win32-x64", "pythonVersion": "3.12.14", "upstream": {"repository": "https://github.com/cisco-ai-defense/skill-scanner", "version": "2.2.2", "commit": "ef5cfee8d15fe207e09d808ccb5be4b9ae6d321a"}, "requirementsSha256": hashlib.sha256(raw.encode()).hexdigest(), "policy": "balanced", "llmJudge": True, "wheels": resources}
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"lockedWheels": len(resources), "archiveBytes": sum(row["size"] for row in resources), "paidRequests": 0}))


if __name__ == "__main__":
    main()

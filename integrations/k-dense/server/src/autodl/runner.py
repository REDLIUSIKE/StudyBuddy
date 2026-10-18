"""Owned remote process group, observed logs/status, bounded execution and safe cancellation."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time

base = Path(__file__).resolve().parent
pid_file = base / 'process.json'
status_file = base / 'status.json'


def pid_start(pid):
    # Linux /proc stat field 22. Parse after the command's last ')' rather than whitespace.
    return Path('/proc/%d/stat' % pid).read_text().rsplit(')', 1)[1].split()[19]


if len(sys.argv) == 2 and sys.argv[1] == 'cancel':
    if status_file.exists():
        sys.exit(0)
    saved = json.loads(pid_file.read_text())
    pid = saved['pid']
    try:
        if pid_start(pid) != saved['start'] or os.getpgid(pid) != pid:
            raise RuntimeError('AUTODL_PROCESS_ID_CHANGED')
        os.killpg(pid, signal.SIGTERM)
        time.sleep(3)
        if pid_start(pid) == saved['start'] and os.getpgid(pid) == pid:
            os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except FileNotFoundError:
        pass
    sys.exit(0)

spec = json.loads((base / 'request.json').read_text())
process = subprocess.Popen(spec['command'], shell=True, cwd=str(base.parent),
                           start_new_session=True, stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE)
pid_file.write_text(json.dumps({'pid': process.pid, 'start': pid_start(process.pid)}))


def pump(source, file_name, fd):
    with (base / file_name).open('wb') as logfile:
        while True:
            chunk = source.read1(65536)
            if not chunk:
                break
            logfile.write(chunk)
            logfile.flush()
            try:
                os.write(fd, chunk)
            except (BrokenPipeError, OSError):
                pass


threads = [threading.Thread(target=pump, args=(process.stdout, 'stdout.log', 1), daemon=True),
           threading.Thread(target=pump, args=(process.stderr, 'stderr.log', 2), daemon=True)]
for thread in threads:
    thread.start()
try:
    code = process.wait(timeout=spec['timeoutSec'])
except subprocess.TimeoutExpired:
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    code = 124
for thread in threads:
    thread.join(timeout=10)
status_file.write_text(json.dumps({'exitCode': code, 'finishedAt': time.time()}))
sys.exit(code if code >= 0 else 128 - code)

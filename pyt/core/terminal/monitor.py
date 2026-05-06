
import os
import subprocess
import time
import atexit
import uuid

from pyt.core.terminal.ansi import codes as ac

CLEAR = ac.clear_screen + ac.move_to(1, 1)

class MonitorWindow:
    def __init__(self):
        self.fifo_path = f"/tmp/monitor_{uuid.uuid4().hex}.fifo"

        if os.path.exists(self.fifo_path):
            os.remove(self.fifo_path)
        os.mkfifo(self.fifo_path)
        atexit.register(self._cleanup)

        reader_script = f"""
import os
path = {repr(self.fifo_path)}
while True:
    with open(path, "r") as f:
        frame = f.read()
    print({repr(CLEAR)}, end="", flush=True)
    print(frame, end="", flush=True)
"""

        self.proc = subprocess.Popen(
            ["alacritty", "-e", "python3", "-c", reader_script],
            preexec_fn=os.setsid
        )

        time.sleep(0.5)

    def write(self, content: str):
        with open(self.fifo_path, "w") as f:
            f.write(content)

    def _cleanup(self):
        if hasattr(self, "proc") and self.proc.poll() is None:
            try:
                os.killpg(os.getpgid(self.proc.pid), 15)
            except Exception:
                pass

        if os.path.exists(self.fifo_path):
            os.remove(self.fifo_path)

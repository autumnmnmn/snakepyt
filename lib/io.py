
import subprocess

from lib.util import mstreamify, streamify

class VideoWriter:
    def __init__(self, dims, fps, outfile, logfile):
        ffmpeg_command = [
            "ffmpeg",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", f"{dims[1]}x{dims[0]}",
            "-r", str(fps),
            "-i", "-",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            outfile
        ]

        self.ffmpeg_log = open(logfile, "a")

        self.ffmpeg_proc = subprocess.Popen(ffmpeg_command,
                                           stdin=subprocess.PIPE,
                                           stdout=self.ffmpeg_log,
                                           stderr=subprocess.STDOUT)

    def close(self):
        self.ffmpeg_proc.stdin.close()
        self.ffmpeg_proc.wait()
        if self.ffmpeg_log:
            self.ffmpeg_log.close()

    def frame_bytes(self, data):
        self.ffmpeg_proc.stdin.write(data)

    def mframe(self, mtensor):
        """ monochrome frame, as torch tensor """
        self.frame_bytes(mstreamify(mtensor))

    def frame(self, tensor):
        self.frame_bytes(streamify(tensor))



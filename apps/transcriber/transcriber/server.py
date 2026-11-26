"""HTTP service of the transcriber, internal to the Docker network (never exposed publicly).

    POST /transcribe?title=…  body: the recording (any format ffmpeg reads)  → 200 audio/midi
    GET  /health                                                             → 200 {"status": "ok"}

One transcription at a time: it takes every core. While busy, 503 with Retry-After (the API queues
its jobs and sends them one by one anyway).
"""
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .audio import UndecodableAudio
from .model import PianoTranscriber

log = logging.getLogger("transcriber")

MAX_BYTES = int(os.environ.get("MAX_BYTES", 60 * 1024 * 1024))
MAX_SECONDS = float(os.environ.get("MAX_SECONDS", 15 * 60))


class Handler(BaseHTTPRequestHandler):
    transcriber: PianoTranscriber
    busy = threading.Lock()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - BaseHTTPRequestHandler's name
        log.debug(format, *args)

    def _json(self, status: int, body: dict[str, object], headers: dict[str, str] | None = None) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 - http.server naming
        if urlparse(self.path).path == "/health":
            self._json(200, {"status": "ok", "busy": self.busy.locked()})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 - http.server naming
        url = urlparse(self.path)
        if url.path != "/transcribe":
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BYTES:
            self._json(413, {"error": f"the recording must be between 1 and {MAX_BYTES} bytes"})
            return
        data = self.rfile.read(length)
        if not self.busy.acquire(blocking=False):
            self._json(503, {"error": "busy"}, {"Retry-After": "30"})
            return
        try:
            title = (parse_qs(url.query).get("title") or [None])[0]
            result = self.transcriber.transcribe(data, MAX_SECONDS, title)
        except UndecodableAudio as error:
            self._json(422, {"error": f"unreadable recording: {error}"})
            return
        except Exception:
            log.exception("transcription failed")
            self._json(500, {"error": "transcription failed"})
            return
        finally:
            self.busy.release()
        if result.notes == 0:
            self._json(422, {"error": "no piano note found in the recording"})
            return
        log.info(
            "transcribed %.0f s in %.0f s: %d notes, %d pedal presses, %d beats",
            result.duration_s, result.elapsed_s, result.notes, result.pedals, result.beats,
        )
        self.send_response(200)
        self.send_header("Content-Type", "audio/midi")
        self.send_header("Content-Length", str(len(result.midi)))
        self.send_header("X-Notes", str(result.notes))
        self.send_header("X-Duration-Seconds", f"{result.duration_s:.1f}")
        self.send_header("X-Elapsed-Seconds", f"{result.elapsed_s:.1f}")
        self.end_headers()
        self.wfile.write(result.midi)


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(message)s")
    threads = int(os.environ.get("THREADS") or os.cpu_count() or 1)
    Handler.transcriber = PianoTranscriber(os.environ["CHECKPOINT"], threads)
    port = int(os.environ.get("PORT", 8000))
    log.info("model loaded (%d threads), listening on %d", threads, port)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()

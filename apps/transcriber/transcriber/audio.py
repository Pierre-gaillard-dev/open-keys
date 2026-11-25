"""Audio side: decoding any format with ffmpeg, and the beats of the recording (librosa)."""
import subprocess

import numpy as np

BEAT_RATE = 22050


class UndecodableAudio(Exception):
    """ffmpeg could not read the file: not audio, or a format it does not know."""


def decode(data: bytes, rate: int, max_seconds: float) -> np.ndarray:
    """Mono float32 samples at `rate`, at most `max_seconds` long (ffmpeg reads mp3, opus, m4a, wav…)."""
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-t", str(max_seconds), "-f", "f32le", "-ac", "1", "-ar", str(rate), "-"],
        input=data,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        raise UndecodableAudio(result.stderr.decode(errors="replace").strip()[-300:] or "no audio")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def beats_of(samples: np.ndarray, rate: int) -> list[float]:
    """Beat times (seconds) found by librosa's beat tracker."""
    import librosa

    if rate != BEAT_RATE:
        samples = librosa.resample(samples, orig_sr=rate, target_sr=BEAT_RATE)
    _, frames = librosa.beat.beat_track(y=samples, sr=BEAT_RATE, units="frames")
    return [float(t) for t in librosa.frames_to_time(frames, sr=BEAT_RATE)]

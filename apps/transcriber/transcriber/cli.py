"""Transcribe a file from the command line (same code as the service).

    python -m transcriber.cli recording.opus output.mid --checkpoint bytedance.pth
"""
import argparse
import os
from pathlib import Path

from .model import PianoTranscriber


def main() -> None:
    parser = argparse.ArgumentParser(description="Piano recording -> MIDI (notes, pedal, beat grid)")
    parser.add_argument("recording")
    parser.add_argument("output")
    parser.add_argument("--checkpoint", default=os.environ.get("CHECKPOINT"), required="CHECKPOINT" not in os.environ)
    parser.add_argument("--no-beats", action="store_true", help="keep 120 bpm instead of the detected beats")
    parser.add_argument("--threads", type=int, default=os.cpu_count() or 1)
    args = parser.parse_args()
    result = PianoTranscriber(args.checkpoint, args.threads).transcribe(
        Path(args.recording).read_bytes(), 3600, Path(args.recording).stem, with_beats=not args.no_beats
    )
    Path(args.output).write_bytes(result.midi)
    print(f"{result.notes} notes, {result.pedals} pedal presses, {result.beats} beats; "
          f"{result.elapsed_s:.0f} s for {result.duration_s:.0f} s of audio -> {args.output}")


if __name__ == "__main__":
    main()

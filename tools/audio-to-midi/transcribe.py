"""Piano recording (mp3, opus, m4a, wav…) -> MIDI for Open Keys: notes, sustain pedal and beat grid.

    python transcribe.py recording.opus output.mid --checkpoint bytedance.pth

Notes and pedal: ByteDance's high-resolution piano transcription (CRNN, CPU). Beats: librosa's beat
tracker; a tempo change at each beat makes the MIDI's own grid fall on the music, so the bars, the
metronome and the count-in of the app follow it. Note times are kept (in seconds). Spike tool: see
README.md. Never commit a recording or a transcription of a copyrighted piece.
"""
import argparse
import subprocess
import time

import librosa
import mido
import numpy as np
from piano_transcription_inference import PianoTranscription, sample_rate

TICKS_PER_BEAT = 480
DEFAULT_BEAT_S = 0.5


def decode(path: str, rate: int) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(rate), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def beat_times(path: str) -> np.ndarray:
    """Detected beats (seconds), with a beat at 0 so the grid starts with the piece."""
    rate = 22050
    _, frames = librosa.beat.beat_track(y=decode(path, rate), sr=rate, units="frames")
    beats = librosa.frames_to_time(frames, sr=rate)
    if len(beats) < 2:
        return np.array([0.0])
    return beats if beats[0] < 0.05 else np.concatenate([[0.0], beats])


def to_ticks(seconds: float, beats: np.ndarray) -> int:
    """Piecewise linear: one beat = TICKS_PER_BEAT ticks; before and after the beats, the last interval."""
    if len(beats) < 2:
        return round(seconds / DEFAULT_BEAT_S * TICKS_PER_BEAT)
    if seconds >= beats[-1]:
        last = beats[-1] - beats[-2]
        return round((len(beats) - 1 + (seconds - beats[-1]) / last) * TICKS_PER_BEAT)
    index = int(np.searchsorted(beats, seconds, side="right") - 1)
    fraction = (seconds - beats[index]) / (beats[index + 1] - beats[index])
    return round((index + fraction) * TICKS_PER_BEAT)


def write_midi(path: str, notes: list, pedals: list, beats: np.ndarray) -> None:
    midi = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    tempo_track = mido.MidiTrack()
    piano = mido.MidiTrack()
    midi.tracks.extend([tempo_track, piano])

    tempo_events = [(0, DEFAULT_BEAT_S)] if len(beats) < 2 else []
    tempo_events += [(i * TICKS_PER_BEAT, beats[i + 1] - beats[i]) for i in range(len(beats) - 1)]
    tempo_events.append((max(0, len(beats) - 1) * TICKS_PER_BEAT, tempo_events[-1][1] if tempo_events else DEFAULT_BEAT_S))
    tempo_track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    last = 0
    for tick, beat_s in tempo_events:
        tempo_track.append(mido.MetaMessage("set_tempo", tempo=round(beat_s * 1_000_000), time=tick - last))
        last = tick

    events = []
    for note in notes:
        events.append((to_ticks(note["onset_time"], beats), 1, mido.Message("note_on", note=note["midi_note"], velocity=max(1, note["velocity"]))))
        events.append((to_ticks(note["offset_time"], beats), 0, mido.Message("note_off", note=note["midi_note"], velocity=0)))
    for pedal in pedals:
        events.append((to_ticks(pedal["onset_time"], beats), 1, mido.Message("control_change", control=64, value=127)))
        events.append((to_ticks(pedal["offset_time"], beats), 0, mido.Message("control_change", control=64, value=0)))
    events.sort(key=lambda event: (event[0], event[1]))
    piano.append(mido.MetaMessage("track_name", name="Piano", time=0))
    last = 0
    for tick, _, message in events:
        piano.append(message.copy(time=tick - last))
        last = tick
    midi.save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("recording")
    parser.add_argument("output")
    parser.add_argument("--checkpoint", required=True, help="ByteDance checkpoint (see README.md)")
    parser.add_argument("--no-beats", action="store_true", help="keep 120 bpm instead of the detected beats")
    args = parser.parse_args()

    audio = decode(args.recording, sample_rate)
    start = time.time()
    model = PianoTranscription(device="cpu", checkpoint_path=args.checkpoint)
    result = model.transcribe(audio, None)
    notes, pedals = result["est_note_events"], result["est_pedal_events"]
    beats = np.array([0.0]) if args.no_beats else beat_times(args.recording)
    write_midi(args.output, notes, pedals, beats)
    seconds = len(audio) / sample_rate
    print(f"{len(notes)} notes, {len(pedals)} pedal presses, {max(0, len(beats) - 1)} beats; "
          f"{time.time() - start:.0f} s for {seconds:.0f} s of audio -> {args.output}")


if __name__ == "__main__":
    main()

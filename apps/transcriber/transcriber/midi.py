"""MIDI file of a transcription: notes and sustain pedal placed on a detected beat grid.

A tempo change at each beat makes the MIDI's own grid fall on the music, so the bars, the metronome
and the count-in of the app follow it. Note times are kept (seconds). Pure: no audio, no model.
"""
import io
from collections.abc import Sequence
from dataclasses import dataclass

import mido
import numpy as np

TICKS_PER_BEAT = 480
DEFAULT_BEAT_S = 0.5
SUSTAIN = 64


@dataclass(frozen=True)
class Note:
    pitch: int
    onset: float
    offset: float
    velocity: int


@dataclass(frozen=True)
class Pedal:
    onset: float
    offset: float


def beat_grid(beats: Sequence[float]) -> np.ndarray:
    """Beat times (seconds) starting at 0, so the grid covers the whole piece; [0] when unknown."""
    times = np.asarray(sorted(beats), dtype=float)
    if len(times) < 2:
        return np.array([0.0])
    return times if times[0] < 0.05 else np.concatenate([[0.0], times])


def to_ticks(seconds: float, grid: np.ndarray) -> int:
    """Piecewise linear: one beat = TICKS_PER_BEAT ticks; after the last beat, its interval goes on."""
    if len(grid) < 2:
        return round(seconds / DEFAULT_BEAT_S * TICKS_PER_BEAT)
    if seconds >= grid[-1]:
        last = grid[-1] - grid[-2]
        return round((len(grid) - 1 + (seconds - grid[-1]) / last) * TICKS_PER_BEAT)
    index = int(np.searchsorted(grid, seconds, side="right") - 1)
    fraction = (seconds - grid[index]) / (grid[index + 1] - grid[index])
    return round((index + fraction) * TICKS_PER_BEAT)


def tempo_events(grid: np.ndarray) -> list[tuple[int, float]]:
    """(tick, seconds per beat) at each beat of the grid."""
    if len(grid) < 2:
        return [(0, DEFAULT_BEAT_S)]
    events = [(i * TICKS_PER_BEAT, grid[i + 1] - grid[i]) for i in range(len(grid) - 1)]
    return events + [((len(grid) - 1) * TICKS_PER_BEAT, events[-1][1])]


def write_midi(notes: Sequence[Note], pedals: Sequence[Pedal], beats: Sequence[float], title: str | None = None) -> bytes:
    """Standard MIDI file (format 1): a tempo track, then the piano with its sustain pedal."""
    grid = beat_grid(beats)
    midi = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    tempo_track, piano = mido.MidiTrack(), mido.MidiTrack()
    midi.tracks.extend([tempo_track, piano])

    if title:
        tempo_track.append(mido.MetaMessage("track_name", name=title, time=0))
    tempo_track.append(mido.MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    last = 0
    for tick, beat_s in tempo_events(grid):
        tempo_track.append(mido.MetaMessage("set_tempo", tempo=round(beat_s * 1_000_000), time=tick - last))
        last = tick

    # At the same tick, releases come before presses: a repeated note is not cut by its own release.
    events: list[tuple[int, int, mido.Message]] = []
    for note in notes:
        events.append((to_ticks(note.onset, grid), 1, mido.Message("note_on", note=note.pitch, velocity=max(1, min(127, note.velocity)))))
        events.append((to_ticks(note.offset, grid), 0, mido.Message("note_off", note=note.pitch, velocity=0)))
    for pedal in pedals:
        events.append((to_ticks(pedal.onset, grid), 1, mido.Message("control_change", control=SUSTAIN, value=127)))
        events.append((to_ticks(pedal.offset, grid), 0, mido.Message("control_change", control=SUSTAIN, value=0)))
    events.sort(key=lambda event: (event[0], event[1]))
    piano.append(mido.MetaMessage("track_name", name="Piano", time=0))
    piano.append(mido.Message("program_change", program=0, time=0))
    last = 0
    for tick, _, message in events:
        piano.append(message.copy(time=tick - last))
        last = tick

    out = io.BytesIO()
    midi.save(file=out)
    return out.getvalue()

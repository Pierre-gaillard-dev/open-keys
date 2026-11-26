"""The MIDI written for a transcription: notes kept in time, pedal, and a grid on the detected beats."""
import io

import mido
import pytest

from transcriber.midi import TICKS_PER_BEAT, Note, Pedal, beat_grid, to_ticks, write_midi


def read(data: bytes) -> mido.MidiFile:
    return mido.MidiFile(file=io.BytesIO(data))


def note_times(midi: mido.MidiFile) -> list[tuple[str, int, float]]:
    """(type, pitch or control, seconds to 10 ms: a tick is about 1.5 ms) of the events, as played."""
    events, now = [], 0.0
    for message in midi:  # merged tracks, delta times in seconds (tempo map applied)
        now += message.time
        if message.type in ("note_on", "note_off"):
            kind = "on" if message.type == "note_on" and message.velocity > 0 else "off"
            events.append((kind, message.note, round(now, 2)))
        elif message.type == "control_change":
            events.append(("pedal" if message.value >= 64 else "pedal-up", message.control, round(now, 2)))
    return events


def test_grid_starts_at_zero_and_ticks_follow_the_beats() -> None:
    grid = beat_grid([0.7, 1.4, 2.2])
    assert list(grid) == [0.0, 0.7, 1.4, 2.2]
    assert to_ticks(0.7, grid) == TICKS_PER_BEAT
    assert to_ticks(1.8, grid) == round(2.5 * TICKS_PER_BEAT)
    # After the last beat, its interval goes on.
    assert to_ticks(3.0, grid) == round((3 + 0.8 / 0.8) * TICKS_PER_BEAT)
    assert list(beat_grid([])) == [0.0]


def test_notes_and_pedal_keep_their_times_on_an_irregular_tempo() -> None:
    notes = [Note(60, 0.5, 1.2, 80), Note(64, 1.25, 2.0, 70), Note(60, 2.0, 2.6, 90)]
    pedals = [Pedal(0.4, 1.9)]
    midi = read(write_midi(notes, pedals, beats=[0.6, 1.3, 1.9, 2.7], title="Essai"))

    assert note_times(midi) == [
        ("pedal", 64, 0.4),
        ("on", 60, 0.5),
        ("off", 60, 1.2),
        ("on", 64, 1.25),
        ("pedal-up", 64, 1.9),
        ("off", 64, 2.0),
        ("on", 60, 2.0),
        ("off", 60, 2.6),
    ]
    tempos = [m.tempo for m in midi.tracks[0] if m.type == "set_tempo"]
    assert tempos[:4] == [600_000, 700_000, 600_000, 800_000]
    assert [m.name for m in midi.tracks[0] if m.type == "track_name"] == ["Essai"]


def test_without_beats_the_grid_is_120_bpm() -> None:
    midi = read(write_midi([Note(60, 1.0, 1.5, 64)], [], beats=[]))
    assert [m.tempo for m in midi.tracks[0] if m.type == "set_tempo"] == [500_000]
    assert note_times(midi) == [("on", 60, 1.0), ("off", 60, 1.5)]


@pytest.mark.parametrize("velocity", [0, 200])
def test_velocities_stay_in_the_midi_range(velocity: int) -> None:
    midi = read(write_midi([Note(60, 0.0, 0.5, velocity)], [], beats=[]))
    on = next(m for m in midi.tracks[1] if m.type == "note_on" and m.velocity > 0)
    assert 1 <= on.velocity <= 127

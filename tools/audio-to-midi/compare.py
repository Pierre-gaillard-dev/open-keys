"""Compare transcriptions of a piano recording, without a reference score.

    python compare.py recording.mp3 reference.mid other.mid [...]


1. Agreement with the reference transcription (ByteDance: 97 % note F1 on MAESTRO), onsets within
   50 ms, and what the notes the other has and the reference has not are.
2. Fidelity to the recording: each MIDI is played back with the app's Salamander samples, and its
   constant-Q spectrogram compared, frame by frame, with the recording's (cosine similarity of
   log magnitudes). A deliberately wrong transcription (ByteDance shifted by a semitone) calibrates
   the scale.
"""
import subprocess
import sys

import librosa
import mir_eval
import numpy as np
import pretty_midi

SR = 16000
HOP = 512
SAMPLES = "/home/pierre-gaillard/Documents/open-keys/apps/web/public/samples/salamander"
NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"]
SAMPLED = {0, 3, 6, 9}


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


_samples: dict[int, np.ndarray] = {}


def sample(pitch: int) -> np.ndarray:
    """The note from the nearest Salamander sample, resampled (like the app's sampler)."""
    nearest = min((p for p in range(21, 109) if p % 12 in SAMPLED), key=lambda p: abs(p - pitch))
    if nearest not in _samples:
        _samples[nearest] = decode(f"{SAMPLES}/{NAMES[nearest % 12]}{nearest // 12 - 1}.mp3")
    source = _samples[nearest]
    ratio = 2 ** ((pitch - nearest) / 12)
    positions = np.arange(0, len(source) - 1, ratio)
    return np.interp(positions, np.arange(len(source)), source).astype(np.float32)


def sustain_ranges(midi: pretty_midi.PrettyMIDI) -> list[tuple[float, float]]:
    ranges, down = [], None
    for cc in sorted((c for i in midi.instruments for c in i.control_changes if c.number == 64), key=lambda c: c.time):
        if cc.value >= 64 and down is None:
            down = cc.time
        elif cc.value < 64 and down is not None:
            ranges.append((down, cc.time))
            down = None
    return ranges


def render(midi: pretty_midi.PrettyMIDI, length: int, shift: int = 0) -> np.ndarray:
    out = np.zeros(length, dtype=np.float32)
    ranges = sustain_ranges(midi)
    for note in (n for i in midi.instruments for n in i.notes):
        end = note.end
        for start, stop in ranges:
            if start <= end <= stop:
                end = stop
        pitch = min(108, max(21, note.pitch + shift))
        pcm = sample(pitch)
        a = int(note.start * SR)
        n = min(len(pcm), int((end - note.start + 0.3) * SR), length - a)
        if n <= 0:
            continue
        envelope = np.ones(n, dtype=np.float32)
        release = min(n, int(0.3 * SR))
        envelope[n - release :] = np.linspace(1, 0, release)
        out[a : a + n] += pcm[:n] * envelope * (note.velocity / 127)
    return out


def cqt(audio: np.ndarray) -> np.ndarray:
    spec = np.abs(librosa.cqt(audio, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("A0"), n_bins=88 * 2, bins_per_octave=24))
    return np.log1p(spec * 10)


def similarity(reference: np.ndarray, other: np.ndarray) -> float:
    frames = min(reference.shape[1], other.shape[1])
    a, b = reference[:, :frames], other[:, :frames]
    loud = a.sum(axis=0) > np.percentile(a.sum(axis=0), 20)
    dot = (a * b).sum(axis=0)
    norm = np.linalg.norm(a, axis=0) * np.linalg.norm(b, axis=0) + 1e-9
    return float((dot / norm)[loud].mean())


def notes_of(midi: pretty_midi.PrettyMIDI):
    notes = [n for i in midi.instruments for n in i.notes]
    intervals = np.array([[n.start, max(n.end, n.start + 0.01)] for n in notes])
    pitches = np.array([librosa.midi_to_hz(n.pitch) for n in notes])
    return intervals, pitches


def extra_notes(reference_notes, other_notes) -> str:
    """The notes `other_notes` has and the reference has not: harmonics, split notes, others."""
    def near(note, tolerance=0.05):
        return [r for r in reference_notes if abs(r.start - note.start) <= tolerance]

    extra = [n for n in other_notes if not any(r.pitch == n.pitch for r in near(n))]
    harmonics = split = 0
    for note in extra:
        intervals = {abs(note.pitch - r.pitch) for r in near(note)}
        if intervals & {12, 19, 24}:
            harmonics += 1
        elif any(r.pitch == note.pitch for r in reference_notes if abs(r.start - note.start) <= 0.5):
            split += 1
    share = 100 * len(extra) / max(1, len(other_notes))
    return (f"{len(extra)} notes not in the reference ({share:.0f} %): {harmonics} at the octave or 12th of "
            f"a note struck with them, {split} split or late, {len(extra) - harmonics - split} others")


recording, reference_path, *others = sys.argv[1:]
audio = decode(recording)
original = cqt(audio)
reference = pretty_midi.PrettyMIDI(reference_path)
ref_intervals, ref_pitches = notes_of(reference)

rows = [("reference", reference, 0), ("reference shifted +1 semitone (wrong, calibration)", reference, 1)]
rows += [(path.rsplit("/", 1)[-1], pretty_midi.PrettyMIDI(path), 0) for path in others]
for label, midi, shift in rows:
    est_intervals, est_pitches = notes_of(midi)
    if shift:
        est_pitches = est_pitches * 2 ** (shift / 12)
    p, r, f, _ = mir_eval.transcription.precision_recall_f1_overlap(
        ref_intervals, ref_pitches, est_intervals, est_pitches, offset_ratio=None
    )
    fidelity = similarity(original, cqt(render(midi, len(audio), shift)))
    print(f"{label}: {len(midi.instruments[0].notes) if midi.instruments else 0} notes, "
          f"agreement with the reference F1 {f:.2f} (P {p:.2f} R {r:.2f}), fidelity {fidelity:.3f}")
    if not shift and midi is not reference:
        reference_notes = [n for i in reference.instruments for n in i.notes]
        print("  " + extra_notes(reference_notes, [n for i in midi.instruments for n in i.notes]))

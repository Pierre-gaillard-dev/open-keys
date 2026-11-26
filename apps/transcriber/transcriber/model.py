"""ByteDance's high-resolution piano transcription (CRNN), on the CPU.

Kong et al., "High-resolution Piano Transcription with Pedals by Regressing Onsets and Offsets Times"
(2021). Inference code: MIT. Checkpoint (Zenodo record 4034264): CC-BY 4.0. Loaded by PyTorch with
`weights_only`: only tensors, no code.
"""
import time
from dataclasses import dataclass

from .audio import beats_of, decode
from .midi import Note, Pedal, write_midi

MODEL_RATE = 16000


@dataclass(frozen=True)
class Transcription:
    midi: bytes
    notes: int
    pedals: int
    beats: int
    duration_s: float
    elapsed_s: float


class PianoTranscriber:
    """Loads the model once; `transcribe` is not reentrant (the server runs one at a time)."""

    def __init__(self, checkpoint: str, threads: int) -> None:
        import torch
        from piano_transcription_inference import PianoTranscription

        torch.set_num_threads(threads)
        self._model = PianoTranscription(device="cpu", checkpoint_path=checkpoint)

    def transcribe(self, data: bytes, max_seconds: float, title: str | None = None, with_beats: bool = True) -> Transcription:
        start = time.monotonic()
        samples = decode(data, MODEL_RATE, max_seconds)
        result = self._model.transcribe(samples, None)
        notes = [
            Note(pitch=int(n["midi_note"]), onset=float(n["onset_time"]), offset=float(n["offset_time"]), velocity=int(n["velocity"]))
            for n in result["est_note_events"]
        ]
        pedals = [Pedal(onset=float(p["onset_time"]), offset=float(p["offset_time"])) for p in result["est_pedal_events"]]
        beats = beats_of(samples, MODEL_RATE) if with_beats else []
        return Transcription(
            midi=write_midi(notes, pedals, beats, title),
            notes=len(notes),
            pedals=len(pedals),
            beats=len(beats),
            duration_s=len(samples) / MODEL_RATE,
            elapsed_s=time.monotonic() - start,
        )

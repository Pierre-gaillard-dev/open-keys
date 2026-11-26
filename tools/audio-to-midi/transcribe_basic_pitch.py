"""Recording -> MIDI with Spotify's Basic Pitch (ONNX, CPU), for comparison. Local use only.

    python transcribe_basic_pitch.py recording.mp3 output.mid
"""
import sys
import time

from basic_pitch import ICASSP_2022_MODEL_PATH
from basic_pitch.inference import Model, predict

src, out = sys.argv[1], sys.argv[2]
model = Model(str(ICASSP_2022_MODEL_PATH).replace("nmp", "nmp.onnx") if not str(ICASSP_2022_MODEL_PATH).endswith(".onnx") else ICASSP_2022_MODEL_PATH)
start = time.time()
_, midi, notes = predict(src, model)
elapsed = time.time() - start
midi.write(out)
print(f"transcribed in {elapsed:.1f} s")
print(f"notes: {len(notes)}, pitch range: {min(n[2] for n in notes)}-{max(n[2] for n in notes)}")

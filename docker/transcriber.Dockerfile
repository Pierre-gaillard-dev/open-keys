# Transcriber: piano recording → MIDI (D34), internal to the Docker network. Build context: repository
# root (see docker-compose.yml). Large image (PyTorch for the CPU, the model): about 1.5 GB.

FROM python:3.12-slim

# ffmpeg reads every audio format (mp3, opus, m4a, wav…); curl fetches the model.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# PyTorch for the CPU only (the GPU build is several GB larger).
RUN pip install --no-cache-dir torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu

WORKDIR /app
COPY apps/transcriber/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# The model: Kong et al. (ByteDance), Zenodo record 4034264, CC-BY 4.0. Checked against its hash.
ARG CHECKPOINT_URL="https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
ARG CHECKPOINT_SHA256=c3fa9730725bf4a762f1c14bc80cd5986eacda01b026f5a4a2525cd607876141
RUN curl --fail --location --silent --show-error --output /app/bytedance.pth "${CHECKPOINT_URL}" \
  && echo "${CHECKPOINT_SHA256}  /app/bytedance.pth" | sha256sum --check --status

COPY apps/transcriber/transcriber ./transcriber

RUN useradd --system --uid 10001 transcriber
USER transcriber
# librosa compiles with numba, whose cache must be writable (not site-packages, owned by root).
ENV CHECKPOINT=/app/bytedance.pth \
  PORT=8000 \
  PYTHONUNBUFFERED=1 \
  NUMBA_CACHE_DIR=/tmp/numba-cache \
  HOME=/tmp
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]
CMD ["python", "-m", "transcriber.server"]

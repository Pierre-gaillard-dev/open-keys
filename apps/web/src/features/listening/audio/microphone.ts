export interface MicrophoneStream {
  readonly sampleRate: number;
  /** Time of the audio clock (AudioContext), to compare with the player's. */
  readonly currentTime: () => number;
  stop(): Promise<void>;
}

/**
 * The microphone, raw (V1.5): no echo cancellation, noise suppression nor automatic gain, which
 * would remove or distort the piano's notes. Samples arrive in chunks of 128.
 */
export async function openMicrophone(onSamples: (samples: Float32Array) => void): Promise<MicrophoneStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
  });
  const context = new AudioContext({ latencyHint: "interactive" });
  try {
    await context.audioWorklet.addModule("/worklets/mic-capture.js");
    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, "mic-capture", { numberOfOutputs: 0 });
    capture.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
    source.connect(capture);
    await context.resume();
  } catch (error) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await context.close();
    throw error;
  }
  return {
    sampleRate: context.sampleRate,
    currentTime: () => context.currentTime,
    async stop() {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      await context.close();
    },
  };
}

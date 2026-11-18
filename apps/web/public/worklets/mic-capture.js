// Microphone capture (V1.5): forwards the samples of the first channel to the page, unchanged.
// A plain file served by the app itself: the CSP allows it as an audio worklet module.
class MicCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      // The buffer is reused by the audio thread: send a copy.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

registerProcessor("mic-capture", MicCapture);

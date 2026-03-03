/**
 * AudioWorklet Processor for Fluid Transcription
 *
 * Receives 128 PCM samples per process() call from the AudioContext,
 * batches them, and forwards to the main thread via port.postMessage().
 *
 * Must be a separate file due to CSP script-src 'self' requirements.
 */

class FluidWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._buffer = [];
        this._batchSize = 4096; // Send batches of 4096 samples (~85ms at 48kHz)
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        // Take first channel (mono)
        const channelData = input[0];
        if (!channelData || channelData.length === 0) return true;

        // Accumulate samples
        for (let i = 0; i < channelData.length; i++) {
            this._buffer.push(channelData[i]);
        }

        // Send batch when buffer is large enough
        if (this._buffer.length >= this._batchSize) {
            this.port.postMessage({
                type: 'samples',
                samples: new Float32Array(this._buffer)
            });
            this._buffer = [];
        }

        return true; // Keep processor alive
    }
}

registerProcessor('fluid-worklet-processor', FluidWorkletProcessor);

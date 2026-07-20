/**
 * Converts an arbitrary audio/video File into MP3 bytes ready for the STT
 * engines: 16 kHz mono, 48 kbps. Runs entirely in the renderer — Chromium
 * decodes the container (video picture is discarded), the same resampling
 * math fluid mode uses reduces it to 16 kHz mono, and lamejs encodes MP3.
 * No external binaries, no network.
 *
 * See docs/SPEC-MEDIA-FILE-IMPORT.md §4.2.
 */
class MediaImportConverter {
    constructor() {
        this.targetSampleRate = 16000; // matches fluid mode
        this.bitrateKbps = 48;         // 0.343 MB/min measured
    }

    /**
     * @param {File|Blob} file
     * @param {(stage: string, ratio: number) => void} [onProgress]
     * @returns {Promise<{blob: Blob, durationSeconds: number}>}
     */
    async convert(file, onProgress) {
        if (onProgress) onProgress('decoding', 0);
        const bytes = await file.arrayBuffer();

        const ctx = new AudioContext();
        let audioBuffer;
        try {
            audioBuffer = await ctx.decodeAudioData(bytes);
        } catch (e) {
            // Always keep the original error: once it is relabelled below the
            // only remaining evidence for a support report is this log line.
            console.error('[MediaImportConverter] decodeAudioData failed:', e);

            // Decoding a long file allocates the whole PCM buffer at once (a
            // 90-minute 48 kHz stereo source is ~1.6 GB), so allocation
            // failures are a normal outcome for big media — not a bad file.
            // Blaming the file here sends the user chasing a phantom problem.
            const message = (e && e.message) || '';
            if (e instanceof RangeError || /allocat|out of memory/i.test(message)) {
                throw new Error('OUT_OF_MEMORY');
            }
            // The AudioContext was closed or the decode aborted underneath us
            // (e.g. the window went away). Again, not a property of the file.
            if (e && (e.name === 'InvalidStateError' || e.name === 'AbortError')) {
                throw new Error('DECODE_ABORTED');
            }
            // Genuine decode failure: Chromium could not open the container or
            // found no audio track. The caller maps NO_AUDIO to a friendly message.
            throw new Error('NO_AUDIO');
        } finally {
            // close() is async; failures here are irrelevant to the result.
            try { ctx.close(); } catch (closeError) { /* ignore */ }
        }
        if (!audioBuffer.length) throw new Error('NO_AUDIO');

        if (onProgress) onProgress('converting', 0);
        const pcm = this._toMono16k(audioBuffer);
        const blob = this._encodeMp3(pcm, onProgress);
        return { blob, durationSeconds: audioBuffer.duration };
    }

    /**
     * Average all channels down to mono, then decimate to 16 kHz.
     * (Fluid mode takes channel 0 because a mic stream is already mono — an
     * imported file can be genuinely stereo, so we average instead of
     * discarding a channel.)
     */
    _toMono16k(audioBuffer) {
        const chans = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
            chans.push(audioBuffer.getChannelData(c));
        }
        const ratio = audioBuffer.sampleRate / this.targetSampleRate;
        const outLen = Math.floor(chans[0].length / ratio);
        const pcm = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const idx = Math.floor(i * ratio);
            let sum = 0;
            for (let c = 0; c < chans.length; c++) sum += chans[c][idx];
            const s = Math.max(-1, Math.min(1, sum / chans.length));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return pcm;
    }

    _encodeMp3(pcm, onProgress) {
        const encoder = new lamejs.Mp3Encoder(1, this.targetSampleRate, this.bitrateKbps);
        const parts = [];
        const BLOCK = 1152; // one MP3 frame
        for (let i = 0; i < pcm.length; i += BLOCK) {
            const chunk = encoder.encodeBuffer(pcm.subarray(i, i + BLOCK));
            if (chunk.length) parts.push(new Uint8Array(chunk));
            if ((i / BLOCK) % 400 === 0 && onProgress) {
                onProgress('converting', i / pcm.length);
            }
        }
        const tail = encoder.flush();
        if (tail.length) parts.push(new Uint8Array(tail));
        return new Blob(parts, { type: 'audio/mpeg' });
    }
}

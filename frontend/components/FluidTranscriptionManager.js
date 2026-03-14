/**
 * FluidTranscriptionManager
 *
 * Orchestrates real-time chunk-by-chunk transcription while recording.
 * Connects to the same mic stream via AudioContext + AudioWorklet,
 * captures PCM samples, encodes WAV chunks every ~30s, and sends
 * each to the backend for parallel transcription.
 *
 * The existing MediaRecorder is NOT touched — this runs in parallel.
 */

class FluidTranscriptionManager {
    constructor(apiClient, backendUrl) {
        this.api = apiClient;
        this.backendUrl = backendUrl;

        // AudioContext / Worklet
        this.audioContext = null;
        this.workletNode = null;
        this.sourceNode = null;

        // PCM sample buffer (Float32 at AudioContext sampleRate, typically 48kHz)
        this.sampleBuffer = [];
        this.targetSampleRate = 16000; // Whisper optimal

        // Chunk configuration
        this.chunkDurationSec = 15; // TODO: Change to 30 for production
        this.overlapSec = 2; // Retain 2s overlap for word boundaries
        this.chunkTimer = null;

        // Session state
        this.sessionId = null;
        this.segmentIndex = 0;
        this.segments = [];        // Array of { index, text, status, language, duration }
        this.pendingChunks = [];   // Promises for in-flight transcriptions
        this._active = false;
        this._paused = false;

        // Callbacks
        this._onSegmentTranscribed = null;
        this.onSegment = null; // callback(text, segmentIndex)
    }

    /**
     * Start fluid transcription.
     * Call AFTER MediaRecorder.start() with the same stream.
     */
    async start(mediaStream) {
        if (this._active) {
            console.warn('FluidTranscriptionManager: already active');
            return;
        }

        this.sessionId = crypto.randomUUID();
        this.segmentIndex = 0;
        this.segments = [];
        this.pendingChunks = [];
        this.sampleBuffer = [];
        this._active = true;

        console.log(`🔄 Fluid transcription started: session=${this.sessionId}`);

        try {
            // Create AudioContext
            this.audioContext = new AudioContext({ sampleRate: 48000 });

            // Load worklet processor
            await this.audioContext.audioWorklet.addModule('../frontend/components/fluid-worklet-processor.js');

            // Create source from existing mic stream
            this.sourceNode = this.audioContext.createMediaStreamSource(mediaStream);

            // Create worklet node
            this.workletNode = new AudioWorkletNode(this.audioContext, 'fluid-worklet-processor');

            // Listen for sample batches from worklet
            this.workletNode.port.onmessage = (event) => {
                if (event.data.type === 'samples') {
                    const samples = event.data.samples;
                    for (let i = 0; i < samples.length; i++) {
                        this.sampleBuffer.push(samples[i]);
                    }
                }
            };

            // Connect: source → worklet → (nowhere, we just capture)
            this.sourceNode.connect(this.workletNode);
            this.workletNode.connect(this.audioContext.destination); // Required for process() to fire

            // Start chunk timer
            console.log(`🔄 Fluid: chunk timer started (every ${this.chunkDurationSec}s)`);
            this.chunkTimer = setInterval(() => {
                console.log(`🔄 Fluid: chunk timer fired, buffer=${this.sampleBuffer.length} samples`);
                this._sendChunk();
            }, this.chunkDurationSec * 1000);

        } catch (error) {
            console.error('❌ Fluid transcription start error:', error);
            this._active = false;
            this._cleanup();
        }
    }

    /**
     * Pause fluid transcription.
     * Flushes current buffer, stops chunk timer, but keeps AudioContext alive.
     */
    pause() {
        if (!this._active || this._paused) return;
        this._paused = true;

        // Stop chunk timer
        if (this.chunkTimer) {
            clearInterval(this.chunkTimer);
            this.chunkTimer = null;
        }

        // Flush current buffer
        this._sendChunk();

        console.log('⏸ Fluid transcription paused');
    }

    /**
     * Resume fluid transcription after pause.
     * Restarts the chunk timer.
     */
    resume() {
        if (!this._active || !this._paused) return;
        this._paused = false;

        // Restart chunk timer
        this.chunkTimer = setInterval(() => {
            this._sendChunk();
        }, this.chunkDurationSec * 1000);

        console.log('▶ Fluid transcription resumed');
    }

    /**
     * Stop fluid transcription.
     * Sends final chunk, waits for all pending transcriptions.
     * Returns assembled result.
     */
    async stop() {
        if (!this._active) {
            return { text: '', segments: [], hasErrors: false, failedCount: 0 };
        }

        this._active = false;

        // Clear chunk timer
        if (this.chunkTimer) {
            clearInterval(this.chunkTimer);
            this.chunkTimer = null;
        }

        // Send final chunk (whatever remains in buffer)
        await this._sendChunk();

        // Wait for all pending chunk transcriptions
        await Promise.allSettled(this.pendingChunks);

        // Cleanup audio resources
        this._cleanup();

        // Assemble result with overlap deduplication
        const failedCount = this.segments.filter(s => s.status === 'error').length;
        const sorted = this.segments.sort((a, b) => a.index - b.index);

        // Deduplicate overlapping text between consecutive successful segments
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].status === 'success' && sorted[i - 1].status === 'success') {
                sorted[i].text = this._deduplicateOverlap(sorted[i - 1].text, sorted[i].text);
            }
        }

        const assembledText = sorted
            .map(s => {
                if (s.status === 'error') {
                    return `<seg status="error">[transcription failed]</seg>`;
                }
                return `<seg>${s.text}</seg>`;
            })
            .join('');

        console.log(`📝 Fluid transcription stopped: session=${this.sessionId}, ` +
                    `segments=${this.segments.length}, failed=${failedCount}`);

        return {
            text: assembledText,
            segments: this.segments,
            hasErrors: failedCount > 0,
            failedCount: failedCount
        };
    }

    /**
     * Register callback for when a segment is transcribed.
     */
    onSegmentTranscribed(callback) {
        this._onSegmentTranscribed = callback;
    }

    /**
     * Check if fluid transcription is currently active.
     */
    isActive() {
        return this._active;
    }

    /**
     * Get the current accumulated text (from completed segments only).
     */
    getAccumulatedText() {
        return this.segments
            .filter(s => s.status === 'success')
            .sort((a, b) => a.index - b.index)
            .map(s => s.text)
            .join(' ');
    }

    // ========================================
    // PRIVATE METHODS
    // ========================================

    /**
     * Send current buffer as a WAV chunk to backend.
     */
    async _sendChunk() {
        // Minimum samples: at least 1 second of audio at source rate
        const minSamples = this.audioContext ? this.audioContext.sampleRate : 48000;
        if (this.sampleBuffer.length < minSamples) {
            return; // Not enough audio, skip (also avoids sending silence after pause flush)
        }

        // Take all buffered samples
        const rawSamples = new Float32Array(this.sampleBuffer);

        // Retain overlap for next chunk (last 2s at source sample rate)
        const sourceSampleRate = this.audioContext ? this.audioContext.sampleRate : 48000;
        const overlapSamples = this.overlapSec * sourceSampleRate;
        if (this.sampleBuffer.length > overlapSamples) {
            this.sampleBuffer = this.sampleBuffer.slice(this.sampleBuffer.length - overlapSamples);
        } else {
            this.sampleBuffer = [];
        }

        // Downsample to 16kHz mono
        const downsampled = this._downsample(rawSamples, sourceSampleRate, this.targetSampleRate);

        // Silence detection: skip chunk if RMS energy is below threshold
        // Prevents Whisper hallucinations on silent audio
        const rms = this._calculateRMS(downsampled);
        const SILENCE_THRESHOLD = 0.01; // ~-40dB, well below normal speech
        if (rms < SILENCE_THRESHOLD) {
            console.log(`🔇 Fluid: chunk skipped (silence detected, RMS=${rms.toFixed(4)})`);
            return;
        }

        // Encode as WAV
        const wavBlob = this._encodeWAV(downsampled, this.targetSampleRate);

        // Track this chunk
        const currentIndex = this.segmentIndex++;
        const chunkPromise = this._transcribeChunk(wavBlob, currentIndex);
        this.pendingChunks.push(chunkPromise);
    }

    /**
     * POST a WAV chunk to the backend for transcription.
     */
    async _transcribeChunk(wavBlob, segmentIndex) {
        try {
            const formData = new FormData();
            formData.append('audio', wavBlob, `chunk_${segmentIndex}.wav`);
            formData.append('session_id', this.sessionId);
            formData.append('segment_index', segmentIndex.toString());

            const response = await fetch(`${this.backendUrl}/api/transcribe/chunk`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            // Store successful segment
            this.segments.push({
                index: segmentIndex,
                text: result.text || '',
                status: 'success',
                language: result.language || 'unknown',
                duration: result.duration || 0
            });

            console.log(`✅ Fluid chunk ${segmentIndex} transcribed: "${(result.text || '').substring(0, 50)}..."`);

            // Fire onSegment callback (for agent feed panel)
            if (this.onSegment) this.onSegment(result.text, segmentIndex);

            // Fire callback
            if (this._onSegmentTranscribed) {
                this._onSegmentTranscribed({
                    index: segmentIndex,
                    text: result.text,
                    status: 'success'
                });
            }

        } catch (error) {
            console.error(`❌ Fluid chunk ${segmentIndex} failed:`, error.message);

            // Store failed segment
            this.segments.push({
                index: segmentIndex,
                text: '',
                status: 'error',
                language: 'unknown',
                duration: 0,
                error: error.message
            });

            // Fire callback with error
            if (this._onSegmentTranscribed) {
                this._onSegmentTranscribed({
                    index: segmentIndex,
                    text: '',
                    status: 'error',
                    error: error.message
                });
            }
        }
    }

    /**
     * Downsample Float32 samples from sourceSampleRate to targetSampleRate.
     */
    _downsample(samples, sourceSampleRate, targetSampleRate) {
        if (sourceSampleRate === targetSampleRate) {
            return samples;
        }

        const ratio = sourceSampleRate / targetSampleRate;
        const newLength = Math.floor(samples.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const srcIndex = Math.floor(i * ratio);
            result[i] = samples[srcIndex];
        }

        return result;
    }

    /**
     * Encode Float32 PCM samples as a WAV file (mono, 16-bit).
     */
    _encodeWAV(samples, sampleRate) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = samples.length * (bitsPerSample / 8);
        const headerSize = 44;
        const totalSize = headerSize + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // RIFF header
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, totalSize - 8, true);
        this._writeString(view, 8, 'WAVE');

        // fmt chunk
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);           // chunk size
        view.setUint16(20, 1, true);             // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data chunk
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Write PCM samples (Float32 → Int16)
        let offset = 44;
        for (let i = 0; i < samples.length; i++) {
            let sample = samples[i];
            // Clamp to [-1, 1]
            sample = Math.max(-1, Math.min(1, sample));
            // Convert to 16-bit integer
            const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, int16, true);
            offset += 2;
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    /**
     * Write a string to a DataView at the given offset.
     */
    _writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * Calculate RMS (root mean square) energy of audio samples.
     * Returns a value 0.0–1.0. Silent audio is near 0.
     */
    _calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }

    /**
     * Remove overlapping words between the end of prevText and start of nextText.
     * Conservative: strict word match (lowercase, no punctuation), requires 3+ consecutive words.
     * If no match found, returns nextText unchanged.
     */
    _deduplicateOverlap(prevText, nextText) {
        const WINDOW = 10;
        const MIN_MATCH = 3;

        const normalize = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

        const prevWords = prevText.trim().split(/\s+/);
        const nextWords = nextText.trim().split(/\s+/);

        if (prevWords.length < MIN_MATCH || nextWords.length < MIN_MATCH) {
            return nextText;
        }

        // Take the last WINDOW words from prev, first WINDOW from next
        const tailRaw = prevWords.slice(-WINDOW);
        const headRaw = nextWords.slice(0, WINDOW);
        const tail = tailRaw.map(normalize);
        const head = headRaw.map(normalize);

        // Find longest match: try starting from each position in tail
        let bestOverlap = 0;

        for (let startInTail = 0; startInTail < tail.length; startInTail++) {
            let matchLen = 0;
            for (let j = 0; j < head.length && (startInTail + j) < tail.length; j++) {
                if (tail[startInTail + j] === head[j]) {
                    matchLen++;
                } else {
                    break;
                }
            }
            // The match must reach the end of tail (it's a suffix match)
            if (startInTail + matchLen === tail.length && matchLen >= MIN_MATCH) {
                bestOverlap = matchLen;
                break;
            }
        }

        if (bestOverlap >= MIN_MATCH) {
            const trimmed = nextWords.slice(bestOverlap).join(' ');
            console.log(`🔄 Dedup: removed ${bestOverlap} overlapping words`);
            return trimmed;
        }

        return nextText;
    }

    /**
     * Clean up AudioContext and nodes.
     */
    _cleanup() {
        if (this.workletNode) {
            try { this.workletNode.disconnect(); } catch (e) { /* ignore */ }
            this.workletNode = null;
        }
        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch (e) { /* ignore */ }
            this.sourceNode = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch (e) { /* ignore */ }
            this.audioContext = null;
        }
    }
}

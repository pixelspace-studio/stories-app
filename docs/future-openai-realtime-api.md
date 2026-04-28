# Future Consideration: OpenAI Realtime API

> Status: **Research / Not planned** — We continue with Whisper chunked transcription for now.

## What is it

OpenAI's Realtime API enables low-latency, multimodal experiences via persistent WebSocket/WebRTC connections. Instead of batch-processing 15s audio chunks through Whisper, audio streams continuously to OpenAI and transcription/responses come back in near real-time.

## Why it's interesting for Stories

Our current architecture:
1. Record audio → buffer 15s chunk → send to Whisper → receive text → forward to agent → agent responds

The Realtime API would collapse this into:
1. Stream audio continuously → receive text as user speaks → agent reacts immediately

**Key benefits:**
- **No chunking delay** — text arrives as the user speaks, not every 15s
- **Built-in VAD** — server-side voice activity detection, no manual silence detection
- **Faster time-to-first-token** — model processes audio while user is still speaking
- **Interruption support** — can detect when user starts speaking again mid-response

## Our use case

- **Input:** Audio (streamed)
- **Output:** Text only (we don't need voice responses)
- This means we'd pay audio input rates but only text output rates

## Models (as of March 2026)

| Model | Based on | Best for | Context window | Audio input/1M | Text output/1M |
|-------|----------|----------|----------------|----------------|----------------|
| `gpt-realtime-mini` | GPT-5 mini | High-volume, speed-first | 128K tokens | $10.00 | $2.40 |
| `gpt-realtime-1.5` | GPT-5.4 | Complex reasoning, multilingual | 1.05M tokens | $32.00 | $16.00 |
| `gpt-realtime` | GPT-5.x | Standard production | - | $32.00 | $16.00 |

**Cached input discount:** Up to 90% savings on repeated system prompts.

**For our needs:** `gpt-realtime-mini` is the obvious choice — lowest cost, lowest latency, text-only output.

## Cost comparison vs current Whisper setup

- **Whisper:** ~$0.006/min of audio (very cheap)
- **Realtime mini audio input:** ~$10/1M tokens (significantly more expensive)
- **Realtime mini text output:** ~$2.40/1M tokens

The Realtime API is substantially more expensive than Whisper. The tradeoff is latency, not cost.

## Architecture implications

Switching would require:
- Replace `FluidTranscriptionManager` chunk-based approach with WebSocket streaming
- Remove 15s buffer logic, silence detection, chunk assembly
- Handle persistent WebSocket connection lifecycle (connect, reconnect, timeout)
- Potentially merge transcription + agent response into single pipeline (the Realtime model can both transcribe AND reason)
- Update feed format — instead of `seg` events every 15s, we'd get continuous text deltas

## Pros and cons

| Pros | Cons |
|------|------|
| Near-zero latency | 10-50x more expensive than Whisper |
| Built-in VAD | WebSocket complexity (reconnects, state) |
| No chunk assembly needed | Vendor lock-in to OpenAI's realtime models |
| Could merge transcription + agent into one call | Less control over transcription vs reasoning |
| Interruption support | Newer API, less battle-tested |

## Decision

**Stay with Whisper for now.** The 15s chunk latency is acceptable for our agent feed use case. The cost difference is significant, and the current architecture is working. Revisit if:
- Users complain about latency as the primary pain point
- OpenAI drops realtime pricing closer to Whisper rates
- We need true conversational (back-and-forth) voice interaction

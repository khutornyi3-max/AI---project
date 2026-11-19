import type { LiveTranscriptEntry } from '../types/decision';

/**
 * Resamples mono Float32 audio samples using linear interpolation.
 * Used to guarantee 16kHz input for Gemini Live API even if the browser
 * AudioContext runs at a native hardware rate (e.g. 44.1kHz or 48kHz).
 */
export function resampleFloat32(
  samples: Float32Array,
  fromSampleRate: number,
  toSampleRate: number,
): Float32Array {
  if (
    samples.length === 0 ||
    !Number.isFinite(fromSampleRate) ||
    !Number.isFinite(toSampleRate) ||
    fromSampleRate <= 0 ||
    toSampleRate <= 0 ||
    Math.round(fromSampleRate) === Math.round(toSampleRate)
  ) {
    return samples;
  }

  const ratio = fromSampleRate / toSampleRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(samples.length - 1, lower + 1);
    const weight = srcIndex - lower;
    result[i] = samples[lower] * (1 - weight) + samples[upper] * weight;
  }

  return result;
}

/**
 * Converts a Uint8Array to a base64 string in both browser and Node environments.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
      'base64',
    );
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to Uint8Array in both browser and Node environments.
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes Float32 PCM samples (-1.0..1.0) into raw 16-bit signed little-endian PCM base64.
 */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }

  return bytesToBase64(new Uint8Array(buffer));
}

/**
 * Decodes raw 16-bit signed little-endian PCM base64 into Float32 samples (-1.0..1.0)
 * for manual AudioBuffer playback at 24kHz.
 */
export function pcm16Base64ToFloat32(base64: string): Float32Array {
  if (!base64) return new Float32Array(0);
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const output = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    output[i] = int16 / 0x8000;
  }

  return output;
}

/**
 * Computes normalized RMS audio level (0..1) for live voice activity meters.
 */
export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return Math.max(0, Math.min(1, rms * 3.2));
}

/**
 * Builds the WebSocket URL matching the current browser protocol (ws:// or wss://).
 */
export function buildLiveWebSocketUrl(
  protocol: string,
  host: string,
  pathname = '/api/live-voice',
): string {
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${wsProtocol}//${host}${normalizedPath}`;
}

/**
 * Appends or merges streaming transcript chunks from the same speaker into a readable log.
 */
export function appendLiveTranscriptChunk(
  entries: LiveTranscriptEntry[],
  speaker: 'user' | 'model',
  rawChunk: string,
  makeId: () => string,
  nowIso: string,
): LiveTranscriptEntry[] {
  const cleaned = rawChunk.replace(/\s+/g, ' ');
  if (!cleaned.trim()) return entries;

  const last = entries[entries.length - 1];
  if (last && last.speaker === speaker) {
    const needsSpace =
      last.text.length > 0 &&
      !/\s$/.test(last.text) &&
      !/^[\s.,!?;:)\]]/.test(cleaned);
    const mergedText = `${last.text}${needsSpace ? ' ' : ''}${cleaned.trimStart()}`;
    return [
      ...entries.slice(0, -1),
      { ...last, text: mergedText },
    ];
  }

  return [
    ...entries,
    {
      id: makeId(),
      speaker,
      text: cleaned.trim(),
      createdAt: nowIso,
    },
  ];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendLiveTranscriptChunk,
  buildLiveWebSocketUrl,
  computeRmsLevel,
  float32ToPcm16Base64,
  pcm16Base64ToFloat32,
  resampleFloat32,
} from './liveAudio';

test('float32ToPcm16Base64 and pcm16Base64ToFloat32 round-trip PCM audio accurately', () => {
  const input = new Float32Array([-1, -0.5, 0, 0.5, 1]);
  const encoded = float32ToPcm16Base64(input);
  const decoded = pcm16Base64ToFloat32(encoded);

  assert.equal(decoded.length, input.length);
  assert.ok(Math.abs(decoded[0] - -1) < 0.001);
  assert.ok(Math.abs(decoded[1] - -0.5) < 0.001);
  assert.equal(decoded[2], 0);
  assert.ok(Math.abs(decoded[3] - 0.5) < 0.001);
  assert.ok(Math.abs(decoded[4] - 1) < 0.001);
});

test('float32ToPcm16Base64 clamps out-of-range samples without overflow', () => {
  const input = new Float32Array([-2.5, 3.2]);
  const decoded = pcm16Base64ToFloat32(float32ToPcm16Base64(input));
  assert.ok(decoded[0] >= -1 && decoded[0] <= -0.99);
  assert.ok(decoded[1] <= 1 && decoded[1] >= 0.99);
});

test('resampleFloat32 downsamples 48kHz to 16kHz cleanly', () => {
  const input = new Float32Array(480);
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((2 * Math.PI * i) / 48);
  }
  const output = resampleFloat32(input, 48000, 16000);
  assert.equal(output.length, 160);
  assert.ok(Math.abs(output[0]) < 0.001);
});

test('resampleFloat32 returns identical array when sample rates match', () => {
  const input = new Float32Array([0.1, 0.2, 0.3]);
  const output = resampleFloat32(input, 16000, 16000);
  assert.equal(output, input);
});

test('computeRmsLevel returns 0 for silence and bounded positive value for signal', () => {
  assert.equal(computeRmsLevel(new Float32Array(128)), 0);
  const loud = new Float32Array(128).fill(0.5);
  const level = computeRmsLevel(loud);
  assert.ok(level > 0.5 && level <= 1);
});

test('buildLiveWebSocketUrl chooses ws or wss based on page protocol', () => {
  assert.equal(
    buildLiveWebSocketUrl('http:', 'localhost:3000'),
    'ws://localhost:3000/api/live-voice',
  );
  assert.equal(
    buildLiveWebSocketUrl('https:', 'tiebreaker.app', '/api/live-voice'),
    'wss://tiebreaker.app/api/live-voice',
  );
});

test('appendLiveTranscriptChunk merges contiguous chunks from the same speaker and splits turns', () => {
  let seq = 0;
  const makeId = () => `tr-${++seq}`;
  const now = '2026-01-01T10:00:00.000Z';

  let list = appendLiveTranscriptChunk([], 'user', 'Привіт,', makeId, now);
  list = appendLiveTranscriptChunk(list, 'user', 'порівняй ці два варіанти.', makeId, now);
  list = appendLiveTranscriptChunk(list, 'model', 'Звісно! Перший варіант', makeId, now);
  list = appendLiveTranscriptChunk(list, 'model', 'дає кращу ліквідність.', makeId, now);

  assert.equal(list.length, 2);
  assert.equal(list[0].speaker, 'user');
  assert.equal(list[0].text, 'Привіт, порівняй ці два варіанти.');
  assert.equal(list[1].speaker, 'model');
  assert.equal(list[1].text, 'Звісно! Перший варіант дає кращу ліквідність.');
});

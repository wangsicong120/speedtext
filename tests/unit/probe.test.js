import test from 'node:test';
import assert from 'node:assert/strict';
import { probeDownload, ProbeQueue, sanitizeProbeResult } from '../../frontend/js/probe.js';
import { until, pendingFetch, streamResponse } from './helpers.js';

const item = { name: 'Fixture', url: 'https://download.example.com/file' };
const success = { status: 'ok', message: 'ok', bytes: 1024, speed: 512, elapsedMs: 2000, firstByteMs: 5, sampledAt: '2026-11-10T00:00:00.000Z' };
test('sample stops at the byte budget and releases the reader', async () => {
  let stream;
  const result = await probeDownload(item, { maxBytes: 1024, fetchImpl: async (_url, { signal }) => {
    stream = streamResponse(signal); stream.push(2048); return stream.response;
  } });
  assert.equal(result.status, 'ok'); assert.equal(result.bytes, 2048); assert(Number.isFinite(result.speed));
  assert.equal(stream.response.body.locked, false);
});
test('small resources are flagged rather than presented as reliable bandwidth samples', async () => {
  const result = await probeDownload(item, { fetchImpl: async () => new Response(new Uint8Array(100)) });
  assert.equal(result.status, 'small'); assert.equal(result.bytes, 100);
});
test('sampling timeout covers stalled body reads and retains partial byte counts', async () => {
  const result = await probeDownload(item, { timeoutMs: 15, fetchImpl: async (_url, { signal }) => {
    const stream = streamResponse(signal); stream.push(512); return stream.response;
  } });
  assert.equal(result.status, 'timeout'); assert.equal(result.bytes, 512);
});
test('sampling timeout also covers connection establishment', async () => {
  const result = await probeDownload(item, { timeoutMs: 10, fetchImpl: pendingFetch });
  assert.equal(result.status, 'timeout'); assert.equal(result.bytes, 0);
});
test('pre-cancelled probes never send a request', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const result = await probeDownload(item, { signal: controller.signal, fetchImpl: () => { calls++; } });
  assert.equal(result.status, 'cancelled'); assert.equal(calls, 0);
});
test('HTTP, empty, and CORS failures produce readable results', async () => {
  assert.equal((await probeDownload(item, { fetchImpl: async () => new Response('bad', { status: 403 }) })).message, 'HTTP 403');
  assert.equal((await probeDownload(item, { fetchImpl: async () => new Response('') })).status, 'error');
  assert.match((await probeDownload(item, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })).message, /CORS/);
});
test('queue deduplicates URLs and never exceeds configured concurrency', async () => {
  let active = 0, peak = 0, calls = 0;
  const queue = new ProbeQueue({ concurrency: 2, probe: async () => {
    active++; calls++; peak = Math.max(peak, active); await Promise.resolve(); active--; return success;
  } });
  const result = await queue.run([item, item, { url: item.url + '/2' }, { url: item.url + '/3' }]);
  assert.equal(calls, 3); assert(peak <= 2); assert.equal(result.completed, 3); assert.equal(result.bytes, 3072);
});
test('cancelled queue callbacks cannot overwrite a restarted queue', async () => {
  const pending = new Map(), received = [], progress = [];
  const queue = new ProbeQueue({ probe: value => new Promise(resolve => pending.set(value.url, resolve)) });
  const first = queue.run([item], { onResult: value => received.push('old:' + value.url), onProgress: value => progress.push(value) });
  await until(() => pending.has(item.url)); queue.stop();
  const newItem = { url: item.url + '/new' };
  const second = queue.run([newItem], { onResult: value => received.push(value.url) });
  pending.get(item.url)(success); await first;
  assert.equal(queue.running, true); assert.equal(received.length, 0);
  pending.get(newItem.url)(success); const result = await second;
  assert.deepEqual(received, [newItem.url]); assert.equal(result.bytes, 1024);
  assert(progress.at(-1).cancelled);
});
test('persisted results reject malformed shapes and strip unrecognized fields', () => {
  assert.equal(sanitizeProbeResult({ ...success, status: 'queued' }), null);
  assert.equal(sanitizeProbeResult({ ...success, sampledAt: 'invalid' }), null);
  assert.equal(sanitizeProbeResult({ ...success, bytes: Infinity }).bytes, 0);
  assert.equal(sanitizeProbeResult({ ...success, executable: 'unsafe' }).executable, undefined);
});

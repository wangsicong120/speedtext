import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSmall, readTextLimited } from '../../frontend/js/network.js';
import { pendingFetch, streamResponse } from './helpers.js';

test('bounded text decoding handles UTF-8 split across chunks', async () => {
  const data = new TextEncoder().encode('中文');
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(data.slice(0, 1)); controller.enqueue(data.slice(1)); controller.close();
  } });
  assert.equal(await readTextLimited(new Response(stream), 10), '中文');
});
test('oversized external text is rejected and the body is cancelled', async () => {
  const stream = streamResponse(); stream.push(50);
  await assert.rejects(readTextLimited(stream.response, 10), /上限/);
  assert.equal(stream.cancelled, true); assert.equal(stream.response.body.locked, false);
});
test('small API fetches omit credentials and referrers', async () => {
  const result = await fetchSmall('/api/health', { fetchImpl: async (_url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response('{"ok":true}');
  } });
  assert.equal(JSON.parse(result.text).ok, true); assert(Number.isFinite(result.latency));
});
test('small fetch connection and body timeouts are bounded', async () => {
  await assert.rejects(fetchSmall('/api/client', { timeoutMs: 10, fetchImpl: pendingFetch }), /超时/);
  await assert.rejects(fetchSmall('/api/client', { timeoutMs: 10, fetchImpl: async (_url, { signal }) => streamResponse(signal).response }), /超时/);
});
test('manual cancellation keeps AbortError semantics', async () => {
  const controller = new AbortController();
  const promise = fetchSmall('/api/client', { signal: controller.signal, fetchImpl: pendingFetch });
  controller.abort(); await assert.rejects(promise, { name: 'AbortError' });
});

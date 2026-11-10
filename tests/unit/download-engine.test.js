import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadEngine } from '../../frontend/js/download-engine.js';
import { until, pendingFetch, streamResponse } from './helpers.js';

const URL = 'https://download.example.com/file?signature=keep%2Fthis';
function create(t, options) {
  const engine = new DownloadEngine(options); t.after(() => engine.stop()); return engine;
}
test('invalid URLs never start a request', t => {
  let calls = 0; const engine = create(t, { fetchImpl: () => { calls++; } });
  assert.throws(() => engine.start({ url: 'http://127.0.0.1/file' })); assert.equal(calls, 0);
});
test('concurrency expands only after the first readable block and all connections abort', async t => {
  const streams = [], signals = [], urls = [];
  const engine = create(t, { fetchImpl: async (url, options) => {
    urls.push(url); signals.push(options.signal);
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    const stream = streamResponse(options.signal); streams.push(stream); return stream.response;
  } });
  assert(engine.start({ url: URL, threads: 4 })); assert.equal(engine.start({ url: URL }), false);
  await until(() => streams.length === 1); assert.equal(streams.length, 1);
  streams[0].push(1024); await until(() => streams.length === 4);
  assert(urls.every(url => url === URL)); assert.equal(engine.snapshot(false).bytes, 1024);
  engine.stop(); await engine.settled(); assert(signals.every(signal => signal.aborted));
  assert.equal(engine.snapshot(false).bytes, 1024); assert.equal(engine.running, false);
});
test('flow limit stops before launching unnecessary parallel connections', async t => {
  let stream, calls = 0;
  const engine = create(t, { fetchImpl: async (_url, { signal }) => { calls++; stream = streamResponse(signal); return stream.response; } });
  engine.start({ url: URL, threads: 32, maxBytes: 2048 }); await until(() => !!stream);
  stream.push(4096); await until(() => !engine.running); await engine.settled();
  assert.equal(engine.snapshot(false).reason, 'limit'); assert.equal(engine.snapshot(false).bytes, 4096); assert.equal(calls, 1);
});
test('duration stops a pending connection without depending on UI ticks', async t => {
  const engine = create(t, { fetchImpl: pendingFetch, idleTimeoutMs: 1000 });
  engine.start({ url: URL, durationSeconds: 0.02 }); await until(() => !engine.running);
  await engine.settled(); assert.equal(engine.snapshot(false).reason, 'duration');
});
test('permanent HTTP errors are not retried or expanded', async t => {
  let calls = 0; const engine = create(t, { fetchImpl: async () => { calls++; return new Response('forbidden', { status: 403 }); } });
  engine.start({ url: URL, threads: 32 }); await until(() => !engine.running); await engine.settled();
  assert.equal(calls, 1); assert.match(engine.snapshot(false).error, /HTTP 403/);
});
for (const [name, response] of [['server error', () => new Response('error', { status: 500 })],
  ['CORS failure', () => { throw new TypeError('Failed to fetch'); }]]) {
  test('consecutive ' + name + ' is bounded to three attempts', async t => {
    let calls = 0; const engine = create(t, { fetchImpl: async () => { calls++; return response(); }, retryBaseMs: 1 });
    engine.start({ url: URL, threads: 32 }); await until(() => !engine.running); await engine.settled();
    assert.equal(calls, 3); assert.equal(engine.snapshot(false).reason, 'error');
  });
}
test('connection timeout aborts and reports a useful error', async t => {
  const engine = create(t, { fetchImpl: pendingFetch, idleTimeoutMs: 10, maxFailures: 1 });
  engine.start({ url: URL }); await until(() => !engine.running); await engine.settled();
  assert.match(engine.snapshot(false).error, /超时/);
});
test('idle timeout also covers the stream after the first block', async t => {
  let stream; const engine = create(t, { fetchImpl: async (_url, { signal }) => {
    stream = streamResponse(signal); return stream.response;
  }, idleTimeoutMs: 15, maxFailures: 1 });
  engine.start({ url: URL, threads: 1 }); await until(() => !!stream); stream.push(1000);
  await until(() => !engine.running); await engine.settled();
  assert.equal(engine.snapshot(false).bytes, 1000); assert.match(engine.snapshot(false).error, /读取超时/);
});
test('finished resources repeat until the byte budget is reached', async t => {
  let calls = 0; const engine = create(t, { fetchImpl: async () => { calls++; return new Response(new Uint8Array(65536)); } });
  engine.start({ url: URL, threads: 1, maxBytes: 65536 * 3 }); await until(() => !engine.running); await engine.settled();
  assert.equal(calls, 3); assert.equal(engine.snapshot(false).bytes, 65536 * 3);
});
test('late results from a stopped session cannot contaminate a restarted session', async t => {
  let resolveOld, newStream, calls = 0;
  const engine = create(t, { fetchImpl: (_url, { signal }) => {
    calls++;
    if (calls === 1) return new Promise(resolve => { resolveOld = resolve; });
    newStream = streamResponse(signal); return Promise.resolve(newStream.response);
  } });
  engine.start({ url: URL, threads: 1 }); engine.stop();
  engine.start({ url: URL, threads: 1 }); await until(() => !!newStream);
  newStream.push(1024); await until(() => engine.snapshot(false).bytes === 1024);
  resolveOld(new Response(new Uint8Array(100000)));
  engine.stop(); await engine.settled(); assert.equal(engine.snapshot(false).bytes, 1024);
});
test('speed and average use elapsed time and remain stable after stopping', async t => {
  let now = 0, stream;
  const engine = create(t, { now: () => now, fetchImpl: async (_url, { signal }) => { stream = streamResponse(signal); return stream.response; } });
  engine.start({ url: URL, threads: 1 }); await until(() => !!stream);
  now = 1000; stream.push(1000); await until(() => engine.snapshot(false).bytes === 1000);
  assert.equal(engine.snapshot().speed, 1000); now = 2000; engine.stop(); await engine.settled();
  now = 5000; assert.equal(engine.snapshot().average, 500); assert.equal(engine.snapshot().elapsed, 2); assert.equal(engine.snapshot().speed, 0);
});
test('unsupported or empty bodies fail safely without buffering', async t => {
  const engine = create(t, { fetchImpl: async () => ({ ok: true, body: null }), maxFailures: 1 });
  engine.start({ url: URL }); await until(() => !engine.running); assert.match(engine.snapshot(false).error, /流式下载/);
  const empty = create(t, { fetchImpl: async () => new Response(''), maxFailures: 1 });
  empty.start({ url: URL }); await until(() => !empty.running); assert.match(empty.snapshot(false).error, /响应为空/);
});

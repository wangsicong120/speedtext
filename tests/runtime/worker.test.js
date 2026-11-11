import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { CONTENT_SECURITY_POLICY } from '../../backend/security.js';

test('production build in the real workerd runtime', async t => {
  const directory = resolve('.cloudflare/output/v0/workers/default');
  const config = JSON.parse(await readFile(resolve(directory, 'worker.config.json'), 'utf8'));
  let outboundRequests = 0;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    name: config.name,
    modules: true,
    scriptPath: resolve(directory, 'bundle', config.manifest.mainModule),
    compatibilityDate: config.compatibilityDate,
    cf: false,
    bindings: { LOCAL_DEV: true },
    assets: { directory: resolve(directory, 'assets'), binding: 'ASSETS',
      run_worker_first: config.assets.runWorkerFirst,
      // Miniflare 5 的 V4 适配器默认按 assets-only 处理；明确启用真实 Worker 路由。
      routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: config.assets.notFoundHandling } },
    host: '127.0.0.1', port: 0,
    log: new Log(LogLevel.ERROR),
    resourcePersistencePath: resolve('.cloudflare/runtime-tests'),
    telemetry: { enabled: false },
    outboundService: () => { outboundRequests++; return new Response('Network disabled in tests', { status: 502 }); }
  }));
  t.after(() => runtime.dispose());
  await runtime.ready;
  const request = async (path, options) => {
    const response = await runtime.dispatchFetch('https://speed.example.com' + path, options);
    if (response.status >= 500) assert.fail(`${path}: ${response.status} ${await response.text()}`);
    return response;
  };

  await t.test('health and config APIs execute in workerd', async () => {
    assert.deepEqual(await (await request('/api/health')).json(), { ok: true, version: '3.2.0' });
    const response = await request('/api/config');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json(); assert.equal(data.arbitraryProxy, false);
    assert.equal(data.limits.defaultMaxBytes, 0);
    assert.equal(data.limits.defaultDurationSeconds, 0);
    assert.equal(data.limits.networkRefreshMs, 30000);
  });
  await t.test('the ASSETS binding serves the actual app and its scripts', async () => {
    const response = await request('/');
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
    const html = await response.text(); assert(html.includes('id="testForm"'));
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
      const script = await request(match[1]); assert.equal(script.status, 200);
      assert.match(script.headers.get('content-type'), /javascript/); await script.body?.cancel();
    }
  });
  await t.test('cross-origin and same-site API calls are denied', async () => {
    for (const headers of [{ Origin: 'https://other.example.com' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
      const response = await request('/api/client', { headers }); assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null); await response.body?.cancel();
    }
  });
  await t.test('methods and HEAD preserve the read-only contract', async () => {
    const head = await request('/api/health', { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const post = await request('/api/client', { method: 'POST' }); assert.equal(post.status, 405); await post.body?.cancel();
    const options = await request('/api/health', { method: 'OPTIONS' });
    assert.equal(options.status, 204); assert.equal(await options.text(), '');
  });
  await t.test('proxy attempts and query parameters cannot create outbound requests', async () => {
    const query = await request('/api/client?url=https://example.com/file'); assert.equal(query.status, 400); await query.body?.cancel();
    const proxy = await request('/api/download'); assert.equal(proxy.status, 404); await proxy.body?.cancel();
    assert.equal(outboundRequests, 0);
  });
  await t.test('development mode ignores spoofed forwarding headers', async () => {
    const response = await request('/api/client', { headers: { 'CF-Connecting-IP': '203.0.113.2', 'X-Forwarded-For': '203.0.113.3' } });
    assert.deepEqual(await response.json(), { source: 'local', ip: null, country: '', region: '', city: '', organization: '', colo: '' });
  });
  await t.test('missing assets and fixture paths remain 404, not an HTML fallback', async () => {
    for (const path of ['/missing', '/backend/worker.js', '/__test__/stream']) {
      const response = await request(path); assert.equal(response.status, 404);
      assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY); await response.body?.cancel();
    }
  });
  assert.equal(outboundRequests, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { clientInfo, handleRequest } from '../../backend/worker.js';
import { CONTENT_SECURITY_POLICY, sameOriginRequest } from '../../backend/security.js';

const request = (path, options) => new Request('https://speed.example.com' + path, options);
test('read-only APIs return no-store JSON and strict security headers', async () => {
  for (const path of ['/api/health', '/api/client', '/api/config']) {
    const response = await handleRequest(request(path));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});
test('cross-origin and same-site API requests are denied', async () => {
  for (const headers of [{ Origin: 'https://attacker.example.com' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    assert.equal((await handleRequest(request('/api/client', { headers }))).status, 403);
  }
  assert(sameOriginRequest(request('/api/client', { headers: { Origin: 'https://speed.example.com', 'Sec-Fetch-Site': 'same-origin' } })));
});
test('download proxy attempts and query parameters never reach assets or the network', async () => {
  let calls = 0; const env = { ASSETS: { fetch: () => { calls++; } } };
  for (const path of ['/api/download?url=https://127.0.0.1/', '/api/client?url=https://example.com/', '/api/health?debug=1']) {
    assert.equal((await handleRequest(request(path), env)).status, 400);
  }
  assert.equal((await handleRequest(request('/api/download'), env)).status, 404);
  assert.equal(calls, 0);
});
test('write methods are rejected and HEAD has no body', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await handleRequest(request('/api/client', { method }))).status, 405);
  const response = await handleRequest(request('/api/health', { method: 'HEAD' }));
  assert.equal(response.status, 200); assert.equal(await response.text(), '');
  const options = await handleRequest(request('/api/health', { method: 'OPTIONS' }));
  assert.equal(options.status, 204); assert.match(options.headers.get('allow'), /GET/);
});
test('local client metadata ignores spoofed IP forwarding headers', () => {
  const value = request('/api/client', { headers: { 'CF-Connecting-IP': '203.0.113.10', 'X-Forwarded-For': '203.0.113.11' } });
  assert.equal(clientInfo(value).ip, null);
  Object.defineProperty(value, 'cf', { value: { country: 'CN' } });
  assert.equal(clientInfo(value, { LOCAL_DEV: true }).ip, null);
});
test('production metadata is bounded and malformed IPs are not reflected', () => {
  const value = request('/api/client', { headers: { 'CF-Connecting-IP': '203.0.113.10' } });
  Object.defineProperty(value, 'cf', { value: { country: 'CN', city: 'x'.repeat(200), asOrganization: 'Example\nOrg', colo: 'HKG' } });
  const info = clientInfo(value); assert.equal(info.ip, '203.0.113.10'); assert.equal(info.city.length, 80);
  assert.equal(info.organization, 'ExampleOrg');
  const invalid = request('/api/client', { headers: { 'CF-Connecting-IP': '999.0.0.1' } });
  Object.defineProperty(invalid, 'cf', { value: {} }); assert.equal(clientInfo(invalid).ip, null);
});
test('static responses preserve content and receive the same security headers', async () => {
  const response = await handleRequest(request('/'), { ASSETS: { fetch: async () => new Response('<h1>Fixture</h1>', { headers: { 'content-type': 'text/html' } }) } });
  assert.equal(await response.text(), '<h1>Fixture</h1>'); assert.equal(response.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.equal((await handleRequest(request('/missing'))).status, 404);
});
test('unexpected failures return sanitized errors, not stack traces', async t => {
  const old = console.error, logs = []; console.error = message => logs.push(message); t.after(() => { console.error = old; });
  const response = await worker.fetch(request('/'), { ASSETS: { fetch: () => { throw new TypeError('secret-token-in-error'); } } });
  assert.equal(response.status, 500); assert(!JSON.stringify(logs).includes('secret-token'));
  assert(!JSON.stringify(await response.json()).includes('secret-token'));
});

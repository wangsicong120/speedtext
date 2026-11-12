import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkPanel, isIpAddress, parseExternalIp } from '../../frontend/js/network.js';
import { pendingFetch } from './helpers.js';

function response(url, options) {
  if (options.mode === 'no-cors') return { type: 'opaque', ok: false, status: 0, body: null };
  if (url === '/api/client') return Response.json({ source: 'local', ip: null });
  if (url === '/api/health') return Response.json({ ok: true });
  if (url === 'https://myip.ipip.net/') return new Response('当前 IP：203.0.113.8 来自：中国 示例');
  if (url === 'https://ipinfo.io/json') return Response.json({ ip: '198.51.100.8', country: 'ZZ' });
  if (url === 'https://api64.ipify.org?format=json') return Response.json({ ip: '2001:db8::8' });
  return new Response('<svg/>');
}

function create(t, options = {}) {
  const nodes = new Map(), timers = new Map(), calls = [], writes = [];
  let timerId = 0, wall = 1000000, monotonic = 0, online = true;
  const document = {
    visibilityState: 'visible', baseURI: 'http://127.0.0.1/speedtext/',
    querySelector: () => ({ getAttribute: () => './assets/favicon.svg' }),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: '', className: '', checked: false, listeners: new Map(),
        addEventListener(name, callback) { this.listeners.set(name, callback); } });
      return nodes.get(id);
    }
  };
  const fetch = options.fetchImpl || response;
  const panel = new NetworkPanel({ documentRef: document, isOnline: () => online,
    now: () => ++monotonic, wallNow: () => wall, requestTimeoutMs: 500, connectivityTimeoutMs: 200,
    read: (_key, fallback) => fallback, write: (key, value) => writes.push([key, value]),
    setTimer: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimer: id => timers.delete(id), ...options,
    fetchImpl: function (url, settings) {
      assert.equal(this, undefined, 'Platform fetch must not receive a NetworkPanel instance as its receiver');
      calls.push({ url, ...settings }); return fetch(url, settings);
    }
  });
  t.after(() => panel.stopAll());
  return { panel, document, nodes, calls, timers, writes, node: id => document.getElementById(id),
    advance: ms => { wall += ms; }, setOnline: value => { online = value; },
    async fireTimer() {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id); timer.callback(); await panel.request?.promise;
    }
  };
}

async function start(environment) {
  environment.panel.start(); await environment.panel.request?.promise;
}

test('IP parsing accepts real IPv4/IPv6 addresses and rejects malformed or executable values', () => {
  for (const ip of ['0.0.0.0', '203.0.113.8', '::1', '2001:db8::1234']) assert.equal(isIpAddress(ip), true);
  for (const ip of ['999.1.1.1', '203.0.113', '2001:::1', 'https://example.com', '<img>', ' 203.0.113.8', null]) assert.equal(isIpAddress(ip), false);
  assert.equal(parseExternalIp('当前 IP：203.0.113.8 来自：中国').ip, '203.0.113.8');
  assert.equal(parseExternalIp('当前 IP：2001:db8::8 来自：示例').ip, '2001:db8::8');
  assert.throws(() => parseExternalIp('{"ip":"<script>"}', true), /有效 IP/);
  assert.throws(() => parseExternalIp('[]', true), /有效 IP/);
});

test('external locations stay bounded literal text, not HTML or unvalidated IP values', () => {
  const info = parseExternalIp(JSON.stringify({ ip: '198.51.100.8', city: '<img src=x onerror=alert(1)>', org: 'x'.repeat(1000) }), true);
  assert(info.message.includes('<img src=x onerror=alert(1)>'));
  assert(info.message.length < 300);
});

test('automatic startup makes only small monitoring requests and has one 30-second schedule', async t => {
  const info = [];
  const environment = create(t, { onInfo: value => info.push(value) }); await start(environment);
  assert.equal(environment.panel.enabled, true);
  assert.equal(environment.node('ipCurrent').textContent, '198.51.100.8');
  assert.match(environment.node('ipSource').textContent, /第三方/);
  assert.match(environment.node('networkStatus').textContent, /本地模式已回退/);
  assert.deepEqual(info.at(-1), { ip: '198.51.100.8', location: 'ZZ', organization: '', source: '第三方' });
  assert.equal(environment.calls.filter(call => call.url.startsWith('https://')).length, 6);
  assert(environment.calls.every(call => call.credentials === 'omit' && call.referrerPolicy === 'no-referrer'));
  assert(!environment.calls.some(call => call.url.includes('__down')));
  assert.equal(environment.timers.size, 1);
  assert.equal([...environment.timers.values()][0].ms, 30000);
  const count = environment.calls.length; environment.panel.resume(); assert.equal(environment.calls.length, count);
  await environment.fireTimer(); assert.equal(environment.calls.length, count * 2);
  assert.equal(environment.timers.size, 1);
});

test('concurrent refreshes share one request group instead of duplicating automatic work', async t => {
  const environment = create(t); environment.panel.start();
  const first = environment.panel.request.promise;
  assert.equal(environment.panel.refresh(), first); await first;
  assert.equal(environment.calls.length, 7);
});

test('platform timer callbacks are invoked without a class receiver', async t => {
  const receivers = [];
  const environment = create(t, {
    setTimer: function (callback, ms) { receivers.push(this); return setTimeout(callback, ms); },
    clearTimer: function (timer) { receivers.push(this); clearTimeout(timer); }
  });
  await start(environment); await environment.panel.refresh(); environment.panel.setAutomatic(false);
  assert(receivers.length >= 4); assert(receivers.every(receiver => receiver === undefined));
});

test('Workers edge metadata takes precedence without mislabelling third-party results', async t => {
  const info = [];
  const environment = create(t, { onInfo: value => info.push(value), fetchImpl: (url, options) => url === '/api/client' ?
    Response.json({ source: 'cloudflare', ip: '203.0.113.20', country: 'CN', region: '四川', city: '成都', organization: '中国电信', colo: 'TEST' }) : response(url, options) });
  await start(environment);
  assert.equal(environment.node('ipCurrent').textContent, '203.0.113.20');
  assert.equal(environment.node('ipSource').textContent, '本站边缘（Cloudflare）');
  assert.match(environment.node('ipgb').textContent, /198.51.100.8/);
  assert.deepEqual(info.at(-1), { ip: '203.0.113.20', location: '四川 成都', organization: '中国电信', source: '本站边缘' });
});

test('static HTML instead of an API falls back to a labelled public IP and same-origin asset latency', async t => {
  const environment = create(t, { fetchImpl: (url, options) => url === '/api/client' ? new Response('<!doctype html>') : response(url, options) });
  await start(environment);
  assert.equal(environment.node('ipCurrent').textContent, '198.51.100.8');
  assert.match(environment.node('networkStatus').textContent, /静态页面.*第三方/);
  assert.match(environment.node('localLatency').textContent, /ms/);
  assert(environment.calls.some(call => call.url === 'http://127.0.0.1/speedtext/assets/favicon.svg'));
  await environment.panel.heartbeat();
  assert.equal(environment.calls.filter(call => call.url === '/api/health').length, 0);
});

test('ipinfo failure falls back to ipify and caches failed providers without sliding the retry deadline', async t => {
  let recovered = false;
  const environment = create(t, { fetchImpl: (url, options) => {
    if (url === '/api/client') return recovered ? Response.json({ source: 'cloudflare', ip: '203.0.113.20' }) : new Response('missing', { status: 404 });
    if (url === 'https://ipinfo.io/json' && !recovered) return new Response('rate limited', { status: 429 });
    return response(url, options);
  } });
  await start(environment);
  assert.equal(environment.node('ipCurrent').textContent, '2001:db8::8');
  assert.match(environment.node('ipSource').textContent, /ipify/);
  const apiDeadline = environment.panel.apiRetryAt, providerDeadline = environment.panel.ipinfoRetryAt;
  for (let count = 0; count < 3; count++) { environment.advance(30000); await environment.fireTimer(); }
  assert.equal(environment.calls.filter(call => call.url === '/api/client').length, 1);
  assert.equal(environment.calls.filter(call => call.url === 'https://ipinfo.io/json').length, 1);
  assert.equal(environment.panel.apiRetryAt, apiDeadline); assert.equal(environment.panel.ipinfoRetryAt, providerDeadline);
  recovered = true; environment.advance(300000); await environment.fireTimer();
  assert.equal(environment.calls.filter(call => call.url === '/api/client').length, 2);
  assert.equal(environment.calls.filter(call => call.url === 'https://ipinfo.io/json').length, 2);
  assert.equal(environment.panel.apiAvailable, true); assert.equal(environment.panel.ipinfoRetryAt, 0);
  assert.equal(environment.node('ipCurrent').textContent, '203.0.113.20');
});

test('disabling automatic updates is persistent, cancels the schedule, and still allows manual refresh', async t => {
  const environment = create(t); await start(environment); const count = environment.calls.length;
  environment.panel.setAutomatic(false);
  assert.deepEqual(environment.writes.at(-1), ['tk_network_auto', false]);
  assert.equal(environment.timers.size, 0); environment.panel.resume(); assert.equal(environment.calls.length, count);
  await environment.panel.refresh({ force: true }); assert.equal(environment.calls.length, count * 2);
  assert.equal(environment.timers.size, 0); assert.match(environment.node('networkStatus').textContent, /自动刷新已关闭/);
});

test('a saved automatic-off preference sends no third-party requests on page open', async t => {
  const environment = create(t, { read: () => false }); await start(environment);
  assert.equal(environment.calls.length, 0); assert.equal(environment.timers.size, 0);
  assert.equal(environment.node('autoNetwork').checked, false);
});

test('disabling an in-flight automatic round aborts requests and does not leave an endless loading state', async t => {
  const environment = create(t, { fetchImpl: pendingFetch }); environment.panel.start();
  const promise = environment.panel.request.promise; environment.panel.setAutomatic(false); await promise;
  assert(environment.calls.every(call => call.signal.aborted)); assert.equal(environment.timers.size, 0);
  assert.equal(environment.node('ipCurrent').textContent, '已取消');
  assert.equal(environment.node('refreshNetwork').textContent, '立即刷新');
});

test('hidden and offline pauses abort work; restoring a visible online page refreshes without downloading', async t => {
  let pending = true;
  const environment = create(t, { fetchImpl: (url, options) => pending ? pendingFetch(url, options) : response(url, options) });
  environment.panel.start(); const promise = environment.panel.request.promise;
  environment.document.visibilityState = 'hidden'; environment.panel.pause('hidden'); await promise;
  assert(environment.calls.every(call => call.signal.aborted)); assert.equal(environment.timers.size, 0);
  const count = environment.calls.length; environment.panel.resume(); assert.equal(environment.calls.length, count);
  environment.document.visibilityState = 'visible'; environment.setOnline(false); environment.panel.resume();
  assert.equal(environment.calls.length, count);
  pending = false; environment.setOnline(true); environment.panel.resume(true); await environment.panel.request.promise;
  assert.equal(environment.node('ipCurrent').textContent, '198.51.100.8'); assert.equal(environment.timers.size, 1);
  assert(!environment.calls.some(call => call.url.includes('__down')));
});

test('late responses from a cancelled page lifetime cannot overwrite a resumed round', async t => {
  let resolveOld, clientCalls = 0;
  const environment = create(t, { fetchImpl: (url, options) => {
    if (url === '/api/client') {
      if (++clientCalls === 1) return new Promise(resolve => { resolveOld = resolve; });
      return Response.json({ source: 'cloudflare', ip: '203.0.113.20' });
    }
    return response(url, options);
  } });
  environment.panel.start(); const old = environment.panel.request.promise;
  environment.panel.pause('pagehide'); environment.panel.resume(); await environment.panel.request.promise;
  resolveOld(Response.json({ source: 'cloudflare', ip: '203.0.113.99' })); await old;
  assert.equal(environment.node('ipCurrent').textContent, '203.0.113.20'); assert.equal(environment.timers.size, 1);
});

test('manual cancellation preserves previous successful results and aborts every new request', async t => {
  let pending = false;
  const environment = create(t, { fetchImpl: (url, options) => pending ? pendingFetch(url, options) : response(url, options) });
  await start(environment); const previous = environment.node('ipCurrent').textContent;
  pending = true; const promise = environment.panel.refresh({ force: true }); environment.panel.cancelRefresh(); await promise;
  assert.equal(environment.node('ipCurrent').textContent, previous);
  assert.match(environment.node('networkStatus').textContent, /已取消/);
  assert(environment.calls.every(call => call.signal.aborted)); assert.equal(environment.timers.size, 1);
});

test('visible HTTP errors remain warnings while opaque results show only elapsed milliseconds', async t => {
  const environment = create(t, { fetchImpl: (url, options) => url === 'https://github.com/favicon.ico' ?
    new Response('error', { status: 500 }) : response(url, options) });
  await start(environment);
  assert.match(environment.node('laygh').textContent, /HTTP 500/); assert.equal(environment.node('laygh').className, 'r-warn');
  for (const id of ['laycn', 'laygb', 'layyt']) {
    assert.match(environment.node(id).textContent, /^\d+ ms$/);
    assert.equal(environment.node(id).className, 'r-ok');
  }
  assert.match(environment.node('networkStatus').textContent, /跨域响应到达不等于 HTTP 成功或服务可登录/);
});

test('all IP services failing stays usable and schedules only the next bounded round', async t => {
  const info = [];
  const environment = create(t, { onInfo: value => info.push(value), fetchImpl: (url, options) => options.mode === 'cors' && url.startsWith('https://') ?
    new Response('unavailable', { status: 503 }) : response(url, options) });
  await start(environment);
  assert.equal(environment.node('ipCurrent').textContent, '暂未测得出口 IP');
  assert.match(environment.node('networkStatus').textContent, /下载功能仍可使用/);
  assert.equal(environment.node('refreshNetwork').textContent, '立即刷新'); assert.equal(environment.timers.size, 1);
  assert.equal(info.at(-1), null);
});

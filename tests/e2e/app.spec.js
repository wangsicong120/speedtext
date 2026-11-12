import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { FIXTURE_ORIGIN, FIXTURE_URL, acceptNextConfirm, configureDownload,
  expectNoOverflow, installNetworkFixtures, installStreams, interceptHttps, openApp, openConfig } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await installNetworkFixtures(page);
  await page.route('https://**/*', route => route.abort());
});

test('limits are off, small monitoring is automatic, and downloads never auto-start or clobber the DOM', async ({ page }) => {
  const external = [], errors = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await installStreams(page);
  await page.clock.install();
  const response = await openApp(page);
  await expect(page.locator('#ipCurrent')).toHaveText('198.51.100.8');
  await expect(page.locator('#ipSource')).toContainText('第三方');
  await expect(page.locator('#autoNetwork')).toBeChecked();
  await expect(page.locator('#maxEnabled')).not.toBeChecked();
  await expect(page.locator('#durationEnabled')).not.toBeChecked();
  await expect(page.locator('#maxMiB')).toHaveValue('0');
  await expect(page.locator('#duration')).toHaveValue('0');
  await expect(page.locator('#maxMiB')).toBeDisabled();
  await expect(page.locator('#duration')).toBeDisabled();
  await expect(page.locator('#curUrl')).toContainText('speed.cloudflare.com/__down');
  await expect(page.locator('#thread')).toHaveValue('4');
  await expect(page.locator('#cacheBust')).not.toBeChecked();
  await expect(page.locator('#keepAlive')).not.toBeChecked();
  await page.clock.fastForward(60000);
  expect(external).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__networkRequests.filter(request => request.url.startsWith('https://')).length)).toBeGreaterThan(6);
  expect(await page.evaluate(() => window.__fixtureRequests.length)).toBe(0);
  await expect(page.locator('#runBadge')).toHaveText('未运行');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).not.toContain('unsafe-');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(await page.evaluate(() => [...document.querySelectorAll('*')].filter(node => typeof node.nodeName !== 'string').length)).toBe(0);
  await expectNoOverflow(page);
});

test('limit switches persist explicitly and remembered values cannot enable a limit while switched off', async ({ page }) => {
  await installStreams(page); await openApp(page);
  await page.locator('#maxEnabled').check(); await page.locator('#maxMiB').fill('1');
  await page.locator('#durationEnabled').check(); await page.locator('#duration').fill('1');
  await page.locator('#thread').focus(); await page.reload();
  await expect(page.locator('#maxEnabled')).toBeChecked(); await expect(page.locator('#durationEnabled')).toBeChecked();
  await expect(page.locator('#maxMiB')).toHaveValue('1'); await expect(page.locator('#duration')).toHaveValue('1');
  await page.locator('#maxEnabled').uncheck(); await page.locator('#durationEnabled').uncheck(); await page.reload();
  await expect(page.locator('#maxMiB')).toBeDisabled(); await expect(page.locator('#duration')).toBeDisabled();
  await configureDownload(page, { maxMiB: 0, duration: 0 });
  acceptNextConfirm(page); await page.locator('#startBtn').click();
  await expect.poll(async () => Number((await page.locator('#elapsed').textContent()).match(/\d+/)[0])).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#runBadge')).toHaveText('运行中');
  await expect(page.locator('#vTotal')).toContainText('MiB'); await page.locator('#startBtn').click();
});

test('theme follows system settings and a manual choice survives reload', async ({ page }, testInfo) => {
  await openApp(page);
  const initial = testInfo.project.use.colorScheme;
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial);
  await page.locator('#themeBtn').click();
  const selected = initial === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
  await expect(page.locator('#themeBtn')).toHaveAttribute('aria-label', selected === 'dark' ? '切换为浅色主题' : '切换为深色主题');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
  await page.emulateMedia({ colorScheme: initial });
  await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
});

test('the live gauge uses Mbps, tracks the selected node and resets on stop without losing samples', async ({ page }) => {
  await installStreams(page); await openApp(page);
  await expect(page.locator('#gaugeValue')).toHaveText('0.0');
  await expect(page.locator('.gauge-unit')).toHaveText('Mbps');
  await expect(page.locator('#gaugeTicks text')).toHaveText(['0', '5', '10', '20', '50', '100', '200', '500', '1G', '2G', '5G']);
  await expect(page.locator('#gaugeArc')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('#gaugeNode')).toHaveText(await page.locator('#curName').textContent());
  await expect(page.locator('#gaugeLocation')).toHaveText('ZZ');
  await expect(page.locator('#gaugeProvider')).toBeHidden();
  await expect(page.locator('#gaugeSource')).toHaveText('第三方');
  await expect(page.locator('#gaugeLatency')).toHaveText('— ms');

  await configureDownload(page, { threads: 1 }); await page.locator('#startBtn').click();
  await expect.poll(async () => Number(await page.locator('#gaugeValue').textContent())).toBeGreaterThan(0);
  const firstByte = (await page.locator('#statusLine').textContent()).match(/首块响应 (\d+) ms/);
  expect(firstByte).not.toBeNull();
  await expect(page.locator('#gaugeLatency')).toHaveText(firstByte[1] + 'ms');
  const values = await page.evaluate(() => ({
    gauge: Number(document.getElementById('gaugeValue').textContent),
    stats: Number(document.getElementById('vMbps').textContent.replace(/[^\d.]/g, '')),
    offset: Number(document.getElementById('gaugeArc').getAttribute('stroke-dashoffset'))
  }));
  expect(Math.abs(values.gauge - values.stats)).toBeLessThanOrEqual(.06);
  expect(values.offset).toBeGreaterThanOrEqual(0); expect(values.offset).toBeLessThan(100);
  await expect(page.locator('#gaugeArc')).toHaveAttribute('visibility', 'visible');
  await expect(page.locator('#gaugeNode')).toHaveText(await page.locator('#curName').textContent());
  await expect(page.locator('#chart')).toHaveAttribute('aria-label', /实时下载带宽.*Mbps.*测试连接首块响应/);
  await page.locator('#startBtn').click();
  await expect(page.locator('#gaugeValue')).toHaveText('0.0');
  await expect(page.locator('#gaugeArc')).toHaveAttribute('visibility', 'hidden');
  await expect(page.locator('#gaugeTicks text')).toHaveCount(11);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('#gaugeArc').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
});

test('the gauge network bar shows detected edge metadata, not the reference image placeholders', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
      const target = new URL(input instanceof Request ? input.url : input, location.href);
      if (target.origin === location.origin && target.pathname === '/api/client') {
        return Promise.resolve(Response.json({ source: 'cloudflare', ip: '203.0.113.20', country: 'CN',
          region: '四川', city: '成都', organization: '中国电信', colo: 'TEST' }));
      }
      return nativeFetch(input, options);
    };
  });
  await openApp(page);
  await expect(page.locator('#gaugeLocation')).toHaveText('四川 成都');
  await expect(page.locator('#gaugeProvider')).toHaveText('中国电信');
  await expect(page.locator('#gaugeSource')).toHaveText('本站边缘');
  await expect(page.locator('#gaugeNetwork')).toHaveAttribute('title', /203\.0\.113\.20/);
  await expect(page.locator('#gaugeValue')).toHaveText('0.0');
  await expectNoOverflow(page);
});

test('unsafe URLs, invalid limits and unbounded confirmation cannot start a download', async ({ page }) => {
  await installStreams(page); await openApp(page);
  for (const url of ['javascript:alert(1)', 'http://example.com/file', 'https://user:password@example.com/file', 'https://127.0.0.1/file']) {
    await page.locator('#diyLink').fill(url); await page.locator('#startBtn').click();
    await expect(page.locator('#linkError')).toBeVisible();
    await expect(page.locator('#diyLink')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#diyLink')).toBeFocused();
  }
  await configureDownload(page, { maxMiB: -1 });
  await page.locator('#maxMiB').focus();
  await page.locator('#startBtn').click(); await expect(page.locator('#limitError')).toContainText('流量上限');
  await expect(page.locator('#maxMiB')).toBeFocused();
  await configureDownload(page, { duration: 86401 });
  await page.locator('#startBtn').click(); await expect(page.locator('#limitError')).toContainText('自动停止');
  await expect(page.locator('#duration')).toBeFocused();
  await page.locator('#thread').fill('999'); await page.locator('#duration').focus();
  await expect(page.locator('#thread')).toHaveValue('32');
  await page.locator('#thPlus').click(); await expect(page.locator('#thread')).toHaveValue('32');
  await page.locator('#thread').fill('1'); await page.locator('#thMinus').click();
  await expect(page.locator('#thread')).toHaveValue('1');
  await configureDownload(page, { maxMiB: 0, duration: 0 });
  let confirmation = '';
  page.once('dialog', async dialog => { confirmation = dialog.message(); await dialog.dismiss(); });
  await page.locator('#startBtn').click();
  expect(confirmation).toContain('流量和时长均未限制');
  expect(await page.evaluate(() => window.__fixtureRequests.length)).toBe(0);
  await expect(page.locator('#runBadge')).toHaveText('未运行');
});

test('stop aborts every connection and a restart begins an isolated session', async ({ page }) => {
  await installStreams(page); await openApp(page); await configureDownload(page);
  await page.locator('#startBtn').click();
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.length)).toBe(4);
  await expect(page.locator('#vTotal')).not.toHaveText('0 B');
  await expect(page.locator('#diyLink')).toBeDisabled();
  await page.locator('#startBtn').click(); await expect(page.locator('#startBtn')).toHaveText('开始测试');
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.every(request => request.aborted))).toBe(true);
  const total = await page.locator('#vTotal').textContent();
  await expect(page.locator('#vSpeed')).toHaveText('0 B/s');
  await page.locator('#openConfig').click(); await page.locator('#closeConfig').click();
  await expect(page.locator('#vTotal')).toHaveText(total);
  await configureDownload(page, { url: FIXTURE_URL + '&session=new', threads: 1 });
  await page.locator('#startBtn').click(); await expect(page.locator('#vTotal')).toHaveText('0 B');
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.length)).toBe(5);
  await expect(page.locator('#vTotal')).not.toHaveText('0 B');
  const entries = await page.evaluate(() => window.__fixtureRequests);
  expect(entries.slice(0, 4).every(entry => entry.aborted)).toBe(true);
  expect(entries[4].url).toContain('session=new'); expect(entries[4].url).not.toContain('_tk=');
  expect(entries.every(entry => entry.credentials === 'omit' && entry.referrerPolicy === 'no-referrer' && entry.mode === 'cors')).toBe(true);
  await page.locator('#startBtn').click();
});

test('the byte budget automatically stops parallel downloads', async ({ page }) => {
  await installStreams(page); await openApp(page);
  await configureDownload(page, { maxMiB: 1, threads: 8 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#statusLine')).toHaveText('已达到流量上限，自动停止。');
  await expect(page.locator('#runBadge')).toHaveText('未运行');
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.every(request => request.aborted))).toBe(true);
  await expect(page.locator('#vTotal')).toContainText('MiB');
  await expect(page.locator('#exportStats')).toBeEnabled();
});

test('a duration limit stops a stalled reader before any bytes arrive', async ({ page }) => {
  await installStreams(page, { stall: true }); await openApp(page);
  await configureDownload(page, { threads: 1, maxMiB: 0, duration: 1 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#statusLine')).toHaveText('已达到时长上限，自动停止。');
  await expect(page.locator('#vTotal')).toHaveText('0 B');
  expect(await page.evaluate(() => window.__fixtureRequests[0].aborted)).toBe(true);
});

test('HTTP and browser-enforced CORS errors are explicit and bounded', async ({ page }) => {
  await installStreams(page); await openApp(page);
  await configureDownload(page, { url: FIXTURE_ORIGIN + '/file?status=403', threads: 32 });
  await page.locator('#startBtn').click(); await expect(page.locator('#statusLine')).toContainText('HTTP 403');
  expect(await page.evaluate(() => window.__fixtureRequests.length)).toBe(1);
  const { requests, errors } = await interceptHttps(page, () => ({
    headers: { 'Content-Type': 'application/octet-stream' }, body: 'no CORS header'
  }));
  await configureDownload(page, { url: 'https://cors.speedtext.example/file', duration: 30 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#statusLine')).toContainText('CORS', { timeout: 15000 });
  expect(requests).toHaveLength(3); expect(errors).toEqual([]);
  await expect(page.locator('#vTotal')).toHaveText('0 B');
  await expect(page.locator('#runBadge')).toHaveText('未运行');
  await expect(page.locator('#downloadRecovery')).toBeVisible();
  await page.locator('#chooseReadable').click();
  await expect(page.locator('#curUrl')).toContainText('speed.cloudflare.com/__down');
  await expect(page.locator('#statusLine')).toContainText('不会自动下载');
  expect(requests).toHaveLength(3);
});

test('custom node names remain literal text and persist without executing HTML', async ({ page }) => {
  await openApp(page); await openConfig(page); await page.locator('#btnAdd').click();
  await page.locator('#addUrl').fill('https://localhost/private');
  await page.locator('#btnAddOk').click(); await expect(page.locator('#addError')).toBeVisible();
  const name = '<img src=x onerror="window.__xss=1">';
  await page.locator('#addName').fill(name); await page.locator('#addUrl').fill(FIXTURE_URL);
  await page.locator('#btnAddOk').click(); await expect(page.locator('#configNotice')).toContainText('已添加');
  await page.locator('#searchInput').fill('stream.speedtext.example');
  await expect(page.locator('.node-row')).toHaveCount(1);
  await expect(page.locator('.node-name')).toHaveText(name);
  await expect(page.locator('#modalBody img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await page.locator('button[data-action="select"]').click(); await expect(page.locator('#curName')).toHaveText(name);
  await expect(page.locator('#gaugeNode')).toHaveText(name);
  await expect(page.locator('#chart img')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#curName')).toHaveText(name);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await openConfig(page); await page.locator('#searchInput').fill('stream.speedtext.example');
  await expect(page.locator('.node-row')).toHaveCount(1);
  await page.locator('button[data-action="remove"]').click();
  await expect(page.locator('.node-row')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.node-row')).toHaveCount(1);
});

test('hiding a repeated address removes all appearances and can be undone or restored', async ({ page }) => {
  await openApp(page); await openConfig(page);
  await page.locator('#searchInput').fill('img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1');
  await expect(page.locator('.node-row')).toHaveCount(3);
  await page.locator('button[data-action="remove"]').first().click();
  await expect(page.locator('.node-row')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.node-row')).toHaveCount(3);
  await page.locator('button[data-action="remove"]').first().click();
  await page.locator('#btnRestore').click(); await expect(page.locator('.node-row')).toHaveCount(3);
});

test('filtered sampling deduplicates, cancels on close, and can restart without late results', async ({ page }) => {
  await installStreams(page, { origins: ['https://img.alicdn.com'] });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }
  }));
  await openApp(page); await openConfig(page);
  await page.locator('#searchInput').fill('img.alicdn.com/imgextra/i1/O1CN01xA4P9S1JsW2WEg0e1');
  await expect(page.locator('.node-row')).toHaveCount(3);
  const messages = []; acceptNextConfirm(page, messages); await page.locator('#btnDetectView').click();
  await expect(page.locator('#detectInfo')).toContainText('检测中 0 / 1');
  expect(messages[0]).toContain('1 个唯一地址'); expect(messages[0]).toContain('8 MiB');
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.length)).toBe(1);
  await page.locator('#closeConfig').click();
  await expect(page.locator('#startBtn')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests[0].aborted)).toBe(true);
  await openConfig(page); acceptNextConfirm(page); await page.locator('#btnDetectView').click();
  await expect(page.locator('#detectInfo')).toContainText('检测完成 1 / 1', { timeout: 15000 });
  expect(await page.evaluate(() => window.__fixtureRequests.length)).toBe(2);
  for (const result of await page.locator('.node-result').all()) await expect(result).toContainText('可读');
  await page.locator('#btnCopyResult').click(); await expect(page.locator('#copyDialog')).toBeVisible();
  const data = JSON.parse(await page.locator('#copyContent').inputValue());
  expect(data.results).toHaveLength(1); expect(data.results[0].status).toBe('ok');
  await page.locator('#closeCopy').click(); await expect(page.locator('#configDialog')).toBeVisible();
});

test('batch sampling ranks by measured speed and selects the fastest only after completion', async ({ page }) => {
  // 本地受控流：fast/medium 都超过 64 KiB，tiny 为小文件；用于验证排序层级和自动选择。
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const profiles = new Map([
      ['https://fast.speedtext.example', { chunks: 18, interval: 20 }],
      ['https://medium.speedtext.example', { chunks: 18, interval: 90 }],
      ['https://tiny.speedtext.example', { chunks: 0 }]
    ]);
    window.fetch = async (input, options = {}) => {
      const target = new URL(input instanceof Request ? input.url : input, location.href);
      const profile = profiles.get(target.origin);
      if (!profile) return nativeFetch(input, options);
      if (!profile.chunks) return new Response(new Uint8Array(120));
      const signal = options.signal;
      let sent = 0, timer = 0, controller;
      const stream = new ReadableStream({
        start(value) {
          controller = value;
          if (window.__stallProbe) return;
          const push = () => {
            if (signal?.aborted) { try { value.error(new DOMException('Aborted', 'AbortError')); } catch {} return; }
            if (sent >= profile.chunks) { try { value.close(); } catch {} return; }
            sent++; value.enqueue(new Uint8Array(65536));
            timer = setTimeout(push, profile.interval);
          };
          timer = setTimeout(push, profile.interval);
        },
        cancel() { clearTimeout(timer); }
      });
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {}
      }, { once: true });
      const response = new Response(stream);
      Object.defineProperty(response, 'url', { value: target.href });
      return response;
    };
  });
  const addNode = async (name, url) => {
    await page.locator('#btnAdd').click();
    await page.locator('#addName').fill(name); await page.locator('#addUrl').fill(url);
    await page.locator('#btnAddOk').click();
    await expect(page.locator('#configNotice')).toContainText('已添加');
  };
  await openApp(page); await openConfig(page);
  await addNode('E2E fast', 'https://fast.speedtext.example/file');
  await addNode('E2E medium', 'https://medium.speedtext.example/file');
  await addNode('E2E tiny', 'https://tiny.speedtext.example/file');
  await page.locator('#searchInput').fill('E2E');
  await expect(page.locator('.node-row')).toHaveCount(3);

  const messages = []; acceptNextConfirm(page, messages);
  await page.locator('#btnDetectView').click();
  await expect(page.locator('#detectInfo')).toContainText('检测完成 3 / 3', { timeout: 20000 });
  expect(messages[0]).toContain('按实测速度排列');
  await expect(page.locator('#configNotice')).toContainText('自动选择“E2E fast”');
  await expect(page.locator('.node-name')).toHaveText(['E2E fast', 'E2E medium', 'E2E tiny']);
  await expect(page.locator('#curName')).toHaveText('E2E fast');
  await expect(page.locator('#curUrl')).toHaveText('https://fast.speedtext.example/file');
  await expect(page.locator('#btnSortSpeed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.node-row').first()).toHaveClass(/current/);

  await page.locator('#btnSortSpeed').click();
  await expect(page.locator('#btnSortSpeed')).toHaveText('按速度排序');
  await page.locator('.node-row').filter({ hasText: 'E2E tiny' }).locator('button[data-action="select"]').click();
  await expect(page.locator('#curName')).toHaveText('E2E tiny');
  await expect(page.locator('#configDialog')).not.toBeVisible();

  await page.evaluate(() => { window.__stallProbe = true; });
  await openConfig(page);
  await page.locator('#searchInput').fill('E2E');
  await expect(page.locator('.node-row')).toHaveCount(3);
  acceptNextConfirm(page); await page.locator('#btnDetectView').click();
  await expect(page.locator('#detectInfo')).toContainText('检测中');
  await page.locator('#btnDetectStop').click();
  await expect(page.locator('#detectInfo')).toContainText('已停止', { timeout: 10000 });
  await expect(page.locator('#configNotice')).toContainText('未自动切换测速地址');
  await expect(page.locator('#curName')).toHaveText('E2E tiny');
  await expect(page.locator('#curUrl')).toHaveText('https://tiny.speedtext.example/file');
});

test('pseudo-screen-off preserves counting and exported stats omit signed URL parameters', async ({ page }, testInfo) => {
  await installStreams(page); await openApp(page);
  await configureDownload(page, { threads: 1, maxMiB: 0, duration: 3 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#vTotal')).not.toHaveText('0 B');
  await page.locator('#screenBtn').click(); await expect(page.locator('#screenOff')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#screenOff')).not.toBeVisible();
  await expect(page.locator('#statusLine')).toContainText('时长上限');
  const downloaded = page.waitForEvent('download'); await page.locator('#exportStats').click();
  const download = await downloaded, path = testInfo.outputPath('stats.json'); await download.saveAs(path);
  const text = await readFile(path, 'utf8'), data = JSON.parse(text);
  expect(text).not.toContain('signed-test'); expect(text).not.toContain('token=');
  expect(data.test.host).toBe('stream.speedtext.example'); expect(data.stats.url).toBeUndefined();
  expect(data.stats.reason).toBe('duration'); expect(data.stats.bytes).toBeGreaterThan(0);
  expect(data.samples.length).toBeGreaterThan(0);
  expect(data.samples.every(sample => Number.isFinite(sample.speed))).toBe(true);
});

test('IP and connectivity update automatically, pause when disabled, and keep external data literal', async ({ page }) => {
  await page.addInitScript(() => { window.__networkFixtureMode = 'native'; });
  await page.clock.install();
  const { requests, errors } = await interceptHttps(page, request => {
    const url = request.url;
    expect(Object.keys(request.headers).some(name => name.toLowerCase() === 'cookie')).toBe(false);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' };
    if (url === 'https://myip.ipip.net/') {
      return { headers: cors, body: '当前 IP：203.0.113.8' };
    } else if (url === 'https://ipinfo.io/json') {
      return { headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: '198.51.100.8', city: '<img src=x onerror=alert(1)>', country: 'ZZ' }) };
    }
    return { status: 500, headers: { 'Content-Type': 'image/x-icon' }, body: 'opaque HTTP response' };
  });
  await openApp(page);
  await expect(page.locator('#ipcn')).toContainText('203.0.113.8');
  await expect(page.locator('#ipgb')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#ipgb img')).toHaveCount(0);
  await expect(page.locator('#networkStatus')).toContainText('跨域响应到达不等于 HTTP 成功');
  expect(requests).toHaveLength(6); expect(errors).toEqual([]);
  await expect(page.locator('#ipCurrent')).toHaveText('198.51.100.8');
  await expect(page.locator('#ipSource')).toContainText('第三方');
  for (const id of ['laycn', 'laygb', 'laygh', 'layyt']) await expect(page.locator('#' + id)).toContainText('响应到达');
  await page.clock.fastForward(30000);
  await expect.poll(() => requests.length).toBe(12);
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新');
  await page.locator('#autoNetwork').uncheck(); await page.clock.fastForward(60000); expect(requests).toHaveLength(12);
  await page.locator('#refreshNetwork').click(); await expect.poll(() => requests.length).toBe(18);
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新');
  await page.reload(); await expect(page.locator('#autoNetwork')).not.toBeChecked(); expect(requests).toHaveLength(18);
});

test('a static API and browser-enforced IP CORS failure use a labelled ipify fallback with a retry cooldown', async ({ page }) => {
  await page.addInitScript(() => { window.__networkFixtureMode = 'native'; });
  await page.clock.install();
  let apiRequests = 0;
  await page.route('**/api/client', route => { apiRequests++; return route.fulfill({ status: 404, body: 'Static site' }); });
  const { requests, errors } = await interceptHttps(page, request => {
    if (request.url === 'https://myip.ipip.net/') return {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }, body: '当前 IP：203.0.113.8'
    };
    if (request.url === 'https://ipinfo.io/json') return {
      headers: { 'Content-Type': 'application/json' }, body: '{"ip":"198.51.100.9"}'
    };
    if (request.url === 'https://api64.ipify.org/?format=json') return {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"ip":"2001:db8::8"}'
    };
    return { status: 500, headers: { 'Content-Type': 'image/x-icon' }, body: 'opaque response' };
  });
  await openApp(page); await expect(page.locator('#ipCurrent')).toHaveText('2001:db8::8');
  await expect(page.locator('#ipSource')).toContainText('ipify');
  await expect(page.locator('#networkStatus')).toContainText('静态页面');
  await expect(page.locator('#localLatency')).toContainText('ms');
  expect(requests).toHaveLength(7); expect(apiRequests).toBe(1);
  await page.clock.fastForward(30000); await expect.poll(() => requests.length).toBe(13);
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新');
  expect(apiRequests).toBe(1); expect(requests.filter(request => request.url === 'https://ipinfo.io/json')).toHaveLength(1);
  await page.locator('#autoNetwork').uncheck(); expect(errors).toEqual([]);
});

test('stopping automatic detection aborts stalled IP body reads', async ({ page }) => {
  await page.addInitScript(() => { window.__networkFixtureMode = 'connectivity-only'; });
  await installStreams(page, { origins: ['https://myip.ipip.net', 'https://ipinfo.io'], stall: true });
  await openApp(page); await expect(page.locator('#refreshNetwork')).toHaveText('停止检测');
  await expect.poll(() => page.evaluate(() => window.__fixtureRequests.length)).toBe(2);
  await page.locator('#refreshNetwork').click();
  await expect(page.locator('#networkStatus')).toContainText('本轮检测已取消');
  await expect(page.locator('#ipcn')).toHaveText('已取消'); await expect(page.locator('#ipgb')).toHaveText('已取消');
  expect(await page.evaluate(() => window.__fixtureRequests.every(request => request.aborted))).toBe(true);
});

test('offline interrupts a running test and reconnecting never auto-starts it', async ({ page, context }) => {
  await installStreams(page); await openApp(page); await configureDownload(page);
  await page.locator('#startBtn').click(); await expect(page.locator('#vTotal')).not.toHaveText('0 B');
  await context.setOffline(true); await expect(page.locator('#statusLine')).toContainText('网络已离线');
  await expect(page.locator('#runBadge')).toHaveText('未运行');
  await context.setOffline(false); await expect(page.locator('#statusLine')).toContainText('测试不会自动开始');
  await expect(page.locator('#runBadge')).toHaveText('未运行');
});

test('denied browser storage degrades to usable in-memory configuration', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Denied', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Denied', 'QuotaExceededError'); };
  });
  await openApp(page); await openConfig(page); await page.locator('#btnAdd').click();
  await page.locator('#addName').fill('仅本页保存'); await page.locator('#addUrl').fill(FIXTURE_URL);
  await page.locator('#btnAddOk').click(); await expect(page.locator('#configNotice')).toContainText('仅在当前页面有效');
  await page.locator('#searchInput').fill('仅本页保存'); await expect(page.locator('.node-row')).toHaveCount(1);
  await page.locator('button[data-action="select"]').click(); await expect(page.locator('#curName')).toHaveText('仅本页保存');
  await expect(page.locator('#startBtn')).toBeEnabled();
});

test('legacy storage cannot blank the page or re-enable the old 100 MiB / 60-second defaults', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tk_custom', '{broken'); localStorage.setItem('tk_hidden', '12');
    localStorage.setItem('tk_theme', '"bad-theme"');
    localStorage.setItem('tk_current', JSON.stringify({ url: 'javascript:alert(1)' }));
    localStorage.setItem('tk_max', '0'); localStorage.setItem('tk_duration', '0');
    localStorage.setItem('tk_limits_v3', JSON.stringify({ maxMiB: 100, duration: 60 }));
  });
  await openApp(page); await expect(page.locator('#curUrl')).toContainText('https://');
  await expect(page.locator('#maxMiB')).toHaveValue('0'); await expect(page.locator('#duration')).toHaveValue('0');
  await expect(page.locator('#maxEnabled')).not.toBeChecked(); await expect(page.locator('#durationEnabled')).not.toBeChecked();
  await openConfig(page); await expect(page.locator('#mSub')).toContainText('161 条 · 154 个唯一地址');
});

test('keyboard skip link, modal focus containment and Escape restore focus', async ({ page }) => {
  await openApp(page); await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('#mainContent')).toBeFocused();
  await page.locator('#openConfig').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#searchInput')).toBeFocused();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#configDialog'))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(page.locator('#configDialog')).not.toBeVisible();
  await expect(page.locator('#openConfig')).toBeFocused();
});

test('responsive portrait and landscape layouts retain usable touch targets and reduced motion', async ({ page }) => {
  await openApp(page); await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await expectNoOverflow(page);
  }
  const desktopHeights = await page.evaluate(() => {
    const height = selector => document.querySelector(selector).getBoundingClientRect().height;
    return { settings: height('.card[aria-labelledby="settingsTitle"]'), chart: height('.card[aria-labelledby="chartTitle"]') };
  });
  expect(Math.abs(desktopHeights.settings - desktopHeights.chart)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 375, height: 812 }); await openConfig(page);
  await page.locator('#btnAdd').click(); await expectNoOverflow(page);
  for (const id of ['screenBtn', 'openConfig', 'themeBtn', 'closeConfig', 'btnAdd', 'btnDetect', 'btnDetectView']) {
    const box = await page.locator('#' + id).boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const reduced = await page.locator('#btnDetect').evaluate(node => getComputedStyle(node).transitionDuration);
  expect(reduced).toBe('0s');
});

test('WCAG automated checks pass for the main page and node dialog in both themes', async ({ page }, testInfo) => {
  await openApp(page);
  for (const index of [0, 1]) {
    if (index) await page.locator('#themeBtn').click();
    for (const modal of [false, true]) {
      if (modal) { await openConfig(page); await page.locator('#btnAdd').click(); }
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      await testInfo.attach(`axe-${index}-${modal ? 'dialog' : 'main'}`, {
        body: JSON.stringify({ violations: results.violations, incomplete: results.incomplete.map(rule => rule.id) }, null, 2), contentType: 'application/json'
      });
      expect(results.violations).toEqual([]);
      if (modal) await page.locator('#closeConfig').click();
    }
  }
});

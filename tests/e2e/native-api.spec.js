import { test, expect } from '@playwright/test';
import { FIXTURE_ORIGIN, FIXTURE_URL, configureDownload, interceptHttps, openApp } from './helpers.js';

// 不安装 fetch 模拟或 page.clock：CDP 构造 HTTP 响应，Window API 保持原生。
// 不用 route.fulfill，避免 Playwright 将 favicon.ico 请求取消。
// CORS/opaque 安全边界另由 app.spec.js 的 CDP 失败场景验证。
async function installHttpFixtures(page) {
  const icons = new Set(['https://www.baidu.com/favicon.ico', 'https://www.cloudflare.com/favicon.ico',
    'https://github.com/favicon.ico', 'https://www.youtube.com/favicon.ico']);
  return interceptHttps(page, request => {
    const url = request.url;
    let body, contentType = 'application/json';
    if (url.startsWith(FIXTURE_ORIGIN + '/file')) {
      body = Buffer.alloc(64 * 1024, 7); contentType = 'application/octet-stream';
    } else if (url === 'https://myip.ipip.net/') {
      body = '当前 IP：203.0.113.8'; contentType = 'text/plain; charset=utf-8';
    } else if (url === 'https://ipinfo.io/json') body = '{"ip":"198.51.100.8"}';
    else if (url === 'https://api64.ipify.org/?format=json') body = '{"ip":"2001:db8::8"}';
    else if (icons.has(url)) { body = ''; contentType = 'image/x-icon'; }
    else throw new Error('Unexpected HTTPS fixture request');
    return { status: 200, body, headers: {
      'Access-Control-Allow-Origin': '*', 'Content-Type': contentType, 'Cache-Control': 'no-store'
    } };
  });
}

test('native Window.fetch downloads a readable response without a false CORS error', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { requests, errors: httpErrors } = await installHttpFixtures(page); await openApp(page);
  await configureDownload(page, { maxMiB: 0.0625, duration: 0, threads: 1 });
  await page.locator('#startBtn').click();
  await expect(page.locator('#statusLine')).toHaveText('已达到流量上限，自动停止。');
  await expect(page.locator('#vTotal')).toHaveText('64 KiB');
  expect(requests.filter(request => request.url === FIXTURE_URL)).toHaveLength(1);
  expect(await page.evaluate(() => window.fetch.toString().includes('[native code]'))).toBe(true);
  expect(errors).toEqual([]); expect(httpErrors).toEqual([]);
});

test('native connectivity and timers complete a second automatic monitoring round', async ({ page }) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const { requests, errors: httpErrors } = await installHttpFixtures(page); await openApp(page);
  await expect(page.locator('#ipCurrent')).toHaveText('198.51.100.8');
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新');
  for (const id of ['laycn', 'laygb', 'laygh', 'layyt']) await expect(page.locator('#' + id)).toHaveText(/^\d+ ms$/);
  expect(requests).toHaveLength(6); expect(errors).toEqual([]);
  expect(await page.evaluate(() => [window.fetch, window.setTimeout, window.clearTimeout]
    .every(callback => callback.toString().includes('[native code]')))).toBe(true);
  const checkedAt = await page.locator('#networkChecked').textContent();
  await expect(page.locator('#networkChecked')).not.toHaveText(checkedAt, { timeout: 40000 });
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新');
  expect(requests).toHaveLength(12); expect(errors).toEqual([]);
  expect(requests.some(request => request.url.includes('__down'))).toBe(false);
  await page.locator('#autoNetwork').uncheck(); await page.locator('#refreshNetwork').click();
  await expect.poll(() => requests.length).toBe(18);
  await expect(page.locator('#refreshNetwork')).toHaveText('立即刷新'); expect(errors).toEqual([]); expect(httpErrors).toEqual([]);
});

import { expect } from '@playwright/test';

export const FIXTURE_ORIGIN = 'https://stream.speedtext.example';
export const FIXTURE_URL = FIXTURE_ORIGIN + '/file?slow=1&token=signed-test%2Fvalue';

// Playwright route.fulfill 会自动补 CORS 头，并会取消 /favicon.ico 请求。
// CDP 仅提供本地构造的 HTTP 响应；浏览器仍实际执行 CORS/opaque 响应与安全策略。
export async function interceptHttps(page, respond) {
  const session = await page.context().newCDPSession(page);
  const requests = [], errors = [];
  session.on('Fetch.requestPaused', async ({ requestId, request }) => {
    requests.push(request);
    try {
      const { status = 200, headers = {}, body = '' } = respond(request);
      await session.send('Fetch.fulfillRequest', {
        requestId, responseCode: status,
        responseHeaders: Object.entries({ 'Cache-Control': 'no-store', ...headers }).map(([name, value]) => ({ name, value })),
        body: Buffer.from(body).toString('base64')
      });
    } catch (error) {
      errors.push(error.message);
      try { await session.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); } catch {}
    }
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] });
  return { requests, errors };
}

// 只在浏览器测试中将指定公开测试域名映射到本地流；生产前端没有此逻辑。
// 保留浏览器的真实 ReadableStream、AbortSignal 与网络取消行为，不下载真实第三方文件。
export async function installStreams(page, { origins = [FIXTURE_ORIGIN], stall = false } = {}) {
  await page.addInitScript(({ origins, stall }) => {
    const nativeFetch = window.fetch.bind(window);
    window.__fixtureRequests = [];
    window.fetch = async (input, options = {}) => {
      const target = new URL(input instanceof Request ? input.url : input, location.href);
      if (!origins.includes(target.origin)) return nativeFetch(input, options);
      const entry = { url: target.href, aborted: false, credentials: options.credentials,
        mode: options.mode, referrerPolicy: options.referrerPolicy };
      window.__fixtureRequests.push(entry);
      options.signal?.addEventListener('abort', () => { entry.aborted = true; }, { once: true });
      const params = new URLSearchParams(target.search);
      if (stall) params.set('stall', '1');
      const response = await nativeFetch('/__test__/stream?' + params, options);
      Object.defineProperty(response, 'url', { value: target.href });
      return response;
    };
  }, { origins, stall });
}

export async function openApp(page) {
  const response = await page.goto('/');
  await expect(page.locator('#startBtn')).toHaveText('开始测试');
  return response;
}

export async function configureDownload(page, { url = FIXTURE_URL, threads = 4, maxMiB = 100, duration = 60 } = {}) {
  await page.locator('#diyLink').fill(url);
  await page.locator('#thread').fill(String(threads));
  await page.locator('#maxMiB').fill(String(maxMiB));
  await page.locator('#duration').fill(String(duration));
}

export async function openConfig(page) {
  await page.locator('#openConfig').click();
  await expect(page.locator('#configDialog')).toBeVisible();
  await expect(page.locator('#searchInput')).toBeFocused();
}

export function acceptNextConfirm(page, messages = []) {
  page.once('dialog', async dialog => { messages.push(dialog.message()); await dialog.accept(); });
}

export async function expectNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth,
    document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

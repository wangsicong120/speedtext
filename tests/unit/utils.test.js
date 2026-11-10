import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, requestUrl, clampThreads, formatBytes, formatSpeed, deduplicate, delay,
  readStorage, writeStorage } from '../../frontend/js/utils.js';

test('HTTPS URLs are normalized without changing signed query bytes', () => {
  assert.equal(normalizeUrl('  https://EXAMPLE.com/a?token=x%2Fy&empty=+&key=1#fragment  '), 'https://example.com/a?token=x%2Fy&empty=+&key=1');
  assert.equal(normalizeUrl('https://example.com:9002/download'), 'https://example.com:9002/download');
});
for (const url of ['http://example.com/file', 'javascript:alert(1)', 'data:text/html,test',
  'file:///C:/test', 'https://user:secret@example.com/file', 'https://localhost/file',
  'https://test.local/file', 'https://test.internal/file', 'https://router.home.arpa/file',
  'https://127.0.0.1/file', 'https://127.1/file', 'https://2130706433/file',
  'https://[::1]/file', 'https://example.com/a\nb', 'https://example.com/\n', '', null]) {
  test('reject unsafe URL: ' + JSON.stringify(url), () => assert.throws(() => normalizeUrl(url)));
}
test('URL length and invalid domain are limited', () => {
  assert.throws(() => normalizeUrl('https://example.com/' + 'a'.repeat(8192)));
  assert.throws(() => normalizeUrl('https://bad_name.example.com/file'));
});
test('random parameters require opt-in and are inserted before fragments', () => {
  assert.equal(requestUrl('https://example.com/a?token=x%2Fy#section'), 'https://example.com/a?token=x%2Fy');
  const url = new URL(requestUrl('https://example.com/a?token=hello#section', true));
  assert.equal(url.searchParams.get('token'), 'hello'); assert(url.searchParams.get('_tk')); assert.equal(url.hash, '');
});
test('thread count is always a finite integer from 1 to 32', () => {
  assert.equal(clampThreads(0), 1); assert.equal(clampThreads(999), 32);
  assert.equal(clampThreads('bad'), 4); assert.equal(clampThreads(3.9), 3);
});
test('byte and speed formats use correct binary units', () => {
  assert.equal(formatBytes(1024), '1 KiB'); assert.equal(formatBytes(1048576), '1 MiB');
  assert.equal(formatBytes(Infinity), '0 B'); assert.equal(formatSpeed(-1), '0 B/s');
});
test('deduplication preserves first appearance', () => {
  const list = [{ url: 'a', name: 'first' }, null, { url: 'b' }, { url: 'a', name: 'second' }];
  assert.deepEqual(deduplicate(list), [list[0], list[2]]);
});
test('retry waits are immediately cancellable', async () => {
  const controller = new AbortController(); const promise = delay(10000, controller.signal);
  controller.abort(); await assert.rejects(promise, { name: 'AbortError' });
  await assert.rejects(delay(10000, controller.signal), { name: 'AbortError' });
});
test('storage denial and malformed JSON degrade safely', t => {
  const old = globalThis.localStorage; t.after(() => { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; });
  globalThis.localStorage = { getItem: () => '{bad', setItem: () => { throw new Error('denied'); } };
  assert.equal(readStorage('key', 42), 42); assert.equal(writeStorage('key', 'data'), false);
});

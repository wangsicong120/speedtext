import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeStore, sanitizeNode } from '../../frontend/js/node-store.js';
import { CUSTOM_DOWNLOAD_NODES, DEFAULT_NODES, NODE_CATALOG_REVISION,
  RECOMMENDED_DOWNLOAD_URL, REMOVED_DOWNLOAD_URLS } from '../../frontend/js/nodes.js';
import { CURATED_NODES_SHA256, EXPECTED_COMPANY_DOWNLOADS, RETAINED_URLS_SHA256,
  SCREENSHOT_REMOVED_NODES } from '../fixtures/node-catalog.js';

const create = values => new NodeStore({ read: (key, fallback) => values?.[key] ?? fallback, write: () => true });
test('the flat catalog preserves every retained URL and its original ordering', () => {
  assert.equal(DEFAULT_NODES.length, 119);
  assert.equal(new Set(DEFAULT_NODES.map(item => item.url)).size, 112);
  assert.equal(createHash('sha256').update(JSON.stringify(DEFAULT_NODES)).digest('hex'), CURATED_NODES_SHA256);
  assert.equal(createHash('sha256').update(JSON.stringify(DEFAULT_NODES.map(item => item.url))).digest('hex'), RETAINED_URLS_SHA256);
  const items = create().all(); assert.equal(items.length, 119);
  assert(items.every(item => !Object.hasOwn(item, 'items') && !Object.hasOwn(item, 'group')));
});
test('exactly the 42 screenshot addresses are retired, not their entire hostnames', () => {
  assert.equal(SCREENSHOT_REMOVED_NODES.length, 42);
  assert.deepEqual(REMOVED_DOWNLOAD_URLS, SCREENSHOT_REMOVED_NODES.map(item => item.url));
  for (const removed of SCREENSHOT_REMOVED_NODES) {
    assert(!DEFAULT_NODES.some(item => item.url === removed.url || item.name === removed.name), removed.name);
  }
  assert.equal(create().all('res.wx.qq.com').length, 1);
  assert.equal(create().all('github.githubassets.com').length, 2);
});
test('the nine custom-download labels use company names and contiguous per-company numbering', () => {
  assert.deepEqual(CUSTOM_DOWNLOAD_NODES, EXPECTED_COMPANY_DOWNLOADS);
  assert.deepEqual(DEFAULT_NODES.slice(6, 15), EXPECTED_COMPANY_DOWNLOADS);
  assert(DEFAULT_NODES.every(item => !item.name.startsWith('自定义下载·')));
  for (const [company, count] of [['百度', 2], ['阿里巴巴', 4]]) {
    assert.deepEqual(CUSTOM_DOWNLOAD_NODES.filter(item => item.name.startsWith(company)).map(item => item.name),
      Array.from({ length: count }, (_, index) => company + (index + 1)));
  }
});
test('corrupt persisted values cannot break initialization', () => {
  const store = create({ tk_custom: 'wrong', tk_hidden: 12, tk_current: { url: 'javascript:alert(1)' } });
  assert.equal(store.custom.length, 0); assert.equal(store.hidden.size, 0); assert(store.current.url.startsWith('https://'));
});
test('custom nodes are validated, truncated, and deduplicated', () => {
  const store = create({ tk_custom: [null, { name: 'x'.repeat(200), url: 'https://example.com/file' },
    { name: 'duplicate', url: 'https://example.com/file' }, { url: 'https://127.0.0.1/private' }] });
  assert.equal(store.custom.length, 1); assert.equal(store.custom[0].name.length, 120);
  assert.deepEqual(Object.keys(sanitizeNode({ url: 'https://example.com/a', extra: 'discard' })).sort(), ['name', 'url']);
});
test('flat search matches names and URLs case-insensitively without old group aliases', () => {
  const store = create(); assert.equal(store.all('百度').length, 15);
  assert.equal(store.all('BAIDUPCS').length, 5); assert.equal(store.all(' 阿里巴巴3 ').length, 1);
  assert.equal(store.all('百度系').length, 0); assert.equal(store.all('CLOUDFLARE').length, 0);
  assert.equal(store.all('no-match-123456789').length, 0);
});
test('hiding a duplicate URL hides all appearances, and undo restores them', () => {
  const store = create(); const url = DEFAULT_NODES[1].url;
  const count = store.all().filter(item => item.url === url).length; assert.equal(count, 3);
  store.remove(url); assert.equal(store.all().length, 119 - count); assert.equal(store.current.url, RECOMMENDED_DOWNLOAD_URL);
  assert(store.undo()); assert.equal(store.all().length, 119);
  store.remove(url); store.restore(); assert.equal(store.hidden.size, 0);
});
test('custom deletion can be undone and duplicates cannot be added', () => {
  const store = create(); const node = store.add({ name: '<img onerror=alert(1)>', url: 'https://example.com/file' });
  assert.equal(node.name, '<img onerror=alert(1)>');
  assert.throws(() => store.add(node), /已存在/); store.remove(node.url, true); assert.equal(store.custom.length, 0);
  store.undo(); assert.equal(store.custom.length, 1);
});
test('custom node count is bounded and blocked storage is reported', () => {
  const store = new NodeStore({ read: (_key, fallback) => fallback, write: () => false });
  store.select({ url: 'https://example.com/a' }); assert.equal(store.persistent, false);
  for (let index = 0; index < 200; index++) store.add({ url: 'https://example.com/' + index });
  assert.throws(() => store.add({ url: 'https://example.com/extra' }), /200/);
});

test('fresh browsers use the first retained node without replacing unrelated saved selections', () => {
  assert.equal(create().current.url, RECOMMENDED_DOWNLOAD_URL);
  const saved = DEFAULT_NODES[2];
  assert.deepEqual(create({ tk_current: saved }).current, saved);
  assert.notEqual(create({ tk_hidden: [RECOMMENDED_DOWNLOAD_URL] }).current.url, RECOMMENDED_DOWNLOAD_URL);
});
test('all retired saved selections reset once to a retained node and persist the migration', () => {
  for (const removed of SCREENSHOT_REMOVED_NODES) {
    const writes = new Map();
    const store = new NodeStore({ read: (key, fallback) => key === 'tk_current' ? removed : fallback,
      write: (key, value) => { writes.set(key, value); return true; } });
    assert.equal(store.selectionReset, true, removed.name);
    assert.equal(store.current.url, RECOMMENDED_DOWNLOAD_URL, removed.name);
    assert.deepEqual(writes.get('tk_current'), store.current);
    assert.equal(writes.get('tk_node_catalog'), NODE_CATALOG_REVISION);
  }
});
test('old saved custom lists clean only retired URLs and rename only recognised custom-download labels', () => {
  const custom = { name: '<literal custom name>', url: 'https://example.com/custom?token=unchanged%2Fvalue' };
  const legacy = EXPECTED_COMPANY_DOWNLOADS.map(item => ({ ...item, name: '自定义下载·' + new URL(item.url).host }));
  const values = { tk_custom: [...SCREENSHOT_REMOVED_NODES, ...legacy, custom],
    tk_current: legacy[5], tk_hidden: [...REMOVED_DOWNLOAD_URLS, DEFAULT_NODES[1].url], tk_theme: 'light' };
  const writes = new Map();
  const store = new NodeStore({ read: (key, fallback) => values[key] ?? fallback,
    write: (key, value) => { writes.set(key, value); return true; } });
  assert.deepEqual(store.custom, [...EXPECTED_COMPANY_DOWNLOADS, custom]);
  assert.deepEqual(store.current, EXPECTED_COMPANY_DOWNLOADS[5]);
  assert.equal(store.selectionReset, false);
  assert.deepEqual(writes.get('tk_custom'), store.custom);
  assert.deepEqual(writes.get('tk_current'), store.current);
  assert.deepEqual(writes.get('tk_hidden'), [DEFAULT_NODES[1].url]);
  assert.equal(writes.has('tk_theme'), false);
  store.restore();
  assert(!store.all().some(item => REMOVED_DOWNLOAD_URLS.includes(item.url)));
});
test('remaining saved node names and unknown custom-download names are not rewritten', () => {
  const saved = { ...DEFAULT_NODES[1], name: '我的保留名称' };
  assert.deepEqual(create({ tk_current: saved }).current, saved);
  const custom = { name: '自定义下载·example.com', url: 'https://example.com/file' };
  assert.deepEqual(create({ tk_current: custom, tk_custom: [custom] }).current, custom);
  assert.deepEqual(create({ tk_custom: [custom] }).custom, [custom]);
});
test('the retirement migration is not a permanent blacklist for later explicit custom choices', () => {
  const values = new Map([['tk_node_catalog', NODE_CATALOG_REVISION]]);
  const options = { read: (key, fallback) => values.get(key) ?? fallback,
    write: (key, value) => { values.set(key, value); return true; } };
  const store = new NodeStore(options);
  const manual = { ...SCREENSHOT_REMOVED_NODES[0], name: '后来手动添加的地址' };
  store.add(manual); store.select(manual);
  const reloaded = new NodeStore(options);
  assert.deepEqual(reloaded.current, manual); assert.deepEqual(reloaded.custom, [manual]);
  assert.equal(reloaded.selectionReset, false);
});
test('retired selections still recover when storage is denied without dropping unrelated memory settings', () => {
  const kept = { name: '保留自定义', url: 'https://example.com/file' };
  const store = new NodeStore({ read: (key, fallback) => ({ tk_current: SCREENSHOT_REMOVED_NODES[0], tk_custom: [kept] })[key] ?? fallback,
    write: () => false });
  assert.equal(store.current.url, RECOMMENDED_DOWNLOAD_URL); assert.equal(store.persistent, false);
  assert.deepEqual(store.custom, [kept]); assert.equal(store.selectionReset, true);
});
test('a partially denied migration stays retryable instead of marking stale persisted addresses as current', () => {
  for (const deniedKey of ['tk_custom', 'tk_hidden', 'tk_current']) {
    const retired = SCREENSHOT_REMOVED_NODES[0];
    const kept = { name: '保留自定义', url: 'https://example.com/file' };
    const values = new Map([['tk_custom', [retired, kept]], ['tk_hidden', [retired.url]], ['tk_current', retired]]);
    let denyWrite = true;
    const options = { read: (key, fallback) => values.get(key) ?? fallback,
      write: (key, value) => {
        if (denyWrite && key === deniedKey) return false;
        values.set(key, structuredClone(value)); return true;
      } };
    const first = new NodeStore(options);
    assert.equal(first.persistent, false, deniedKey);
    assert.equal(first.current.url, RECOMMENDED_DOWNLOAD_URL);
    assert.equal(values.has('tk_node_catalog'), false, deniedKey);
    denyWrite = false;
    const recovered = new NodeStore(options);
    assert.equal(recovered.persistent, true, deniedKey);
    assert.deepEqual(recovered.custom, [kept]);
    assert.equal(recovered.current.url, RECOMMENDED_DOWNLOAD_URL);
    assert.deepEqual(values.get('tk_hidden'), []);
    assert.equal(values.get('tk_node_catalog'), NODE_CATALOG_REVISION);
  }
});

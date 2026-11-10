import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeStore, sanitizeNode } from '../../frontend/js/node-store.js';
import { DEFAULT_GROUPS, RECOMMENDED_DOWNLOAD_URL } from '../../frontend/js/nodes.js';

const create = values => new NodeStore({ read: (key, fallback) => values?.[key] ?? fallback, write: () => true });
test('all original grouped nodes were migrated exactly', () => {
  assert.equal(DEFAULT_GROUPS.length, 17);
  assert.equal(DEFAULT_GROUPS.flatMap(group => group.items).length, 161);
  assert.equal(createHash('sha256').update(JSON.stringify(DEFAULT_GROUPS)).digest('hex'), 'd5bbce4ce005981bf1b5789e2ff77ad7b8590ac84f5d8bbda98fc822835fd58e');
  assert.equal(create().all().length, 161);
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
test('search matches grouping, names, and URLs case-insensitively', () => {
  const store = create(); assert.equal(store.groups('百度系')[0].items.length, 17);
  assert(store.all('CLOUDFLARE').length >= 2); assert.equal(store.all('no-match-123456789').length, 0);
});
test('hiding a duplicate URL hides all appearances, and undo restores them', () => {
  const store = create(); const url = DEFAULT_GROUPS[0].items[1].url;
  const count = store.all().filter(item => item.url === url).length; assert.equal(count, 3);
  store.remove(url); assert.equal(store.all().length, 161 - count); assert.equal(store.current.url, RECOMMENDED_DOWNLOAD_URL);
  assert(store.undo()); assert.equal(store.all().length, 161);
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

test('fresh browsers prefer the CORS-capable speed endpoint without replacing saved selections', () => {
  assert.equal(create().current.url, RECOMMENDED_DOWNLOAD_URL);
  const saved = DEFAULT_GROUPS[0].items[0];
  assert.equal(create({ tk_current: saved }).current.url, saved.url);
  assert.notEqual(create({ tk_hidden: [RECOMMENDED_DOWNLOAD_URL] }).current.url, RECOMMENDED_DOWNLOAD_URL);
});

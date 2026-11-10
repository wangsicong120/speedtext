import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { DEFAULT_GROUPS } from '../frontend/js/nodes.js';
import { normalizeUrl } from '../frontend/js/utils.js';
import { CONTENT_SECURITY_POLICY } from '../backend/security.js';
import { VERSION } from '../shared/limits.js';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.name.endsWith('.js')) result.push(path);
  }
  return result;
}

const sources = (await Promise.all(['frontend/js', 'backend', 'shared', 'scripts', 'tests'].map(files))).flat();
for (const path of [...sources, 'vite.config.js', 'vite.static.config.js', 'playwright.config.js']) {
  const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${path}: ${check.stderr}`);
}
const html = await readFile('frontend/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
for (const path of sources.filter(path => path.startsWith('frontend'))) {
  const source = await readFile(path, 'utf8');
  assert(!/\.innerHTML\s*=|\b(?:eval|Function)\s*\(|document\.write\s*\(/.test(source), `${path}: unsafe DOM sink`);
  for (const match of source.matchAll(/\$\('([^']+)'\)/g)) assert(ids.includes(match[1]), `${path}: missing #${match[1]}`);
}
assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(html), 'Zoom must remain enabled');
assert(html.includes('<main') && html.includes('skip-link'), 'Main landmark and skip link required');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  assert(/src="\.\//.test(script[1]) && !script[2].trim(), 'Only local external scripts are allowed');
}
for (const input of html.matchAll(/<(?:input|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
  assert(html.includes(`for="${input[1]}"`) || input[0].includes('type="checkbox"'), `Missing label: #${input[1]}`);
}
const reservedFormNames = new Set(['nodeName', 'tagName', 'id', 'name', 'action', 'method', 'submit',
  'reset', 'elements', 'length', 'target', 'attributes', 'style', 'children', 'constructor', '__proto__']);
for (const field of html.matchAll(/<(?:input|textarea|button)\b[^>]*\bname="([^"]+)"[^>]*>/g)) {
  assert(!reservedFormNames.has(field[1]), `Form field clobbers a browser property: ${field[1]}`);
}
const items = DEFAULT_GROUPS.flatMap(group => group.items);
assert.equal(DEFAULT_GROUPS.length, 17); assert.equal(items.length, 161);
assert.equal(new Set(items.map(item => item.url)).size, 154);
for (const item of items) normalizeUrl(item.url);
assert.equal(createHash('sha256').update(JSON.stringify(DEFAULT_GROUPS)).digest('hex'),
  'd5bbce4ce005981bf1b5789e2ff77ad7b8590ac84f5d8bbda98fc822835fd58e', 'Original node data changed');
assert(!CONTENT_SECURITY_POLICY.includes('unsafe-inline') && !CONTENT_SECURITY_POLICY.includes('unsafe-eval'));
assert.equal(JSON.parse(await readFile('package.json', 'utf8')).version, VERSION);
console.log(`Checks passed: ${sources.length} JS files, ${ids.length} unique HTML IDs, 161 preserved nodes, strict CSP.`);

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('.cloudflare/output/v0');
const worker = resolve(output, 'workers/default');
const root = JSON.parse(await readFile(resolve(output, 'config.json'), 'utf8'));
const config = JSON.parse(await readFile(resolve(worker, 'worker.config.json'), 'utf8'));
assert.equal(root.buildContext.mode, 'production');
assert.equal(config.name, 'speedtext');
assert.equal(config.env.ASSETS.type, 'assets');
assert(!Object.hasOwn(config.env, 'LOCAL_DEV'), 'Production must not ship the development-only client metadata flag');
assert.equal(config.assets.runWorkerFirst, true);
assert.equal(config.manifest.type, 'partial', 'A real Worker bundle is required, not assets-only output');
assert((await stat(resolve(worker, 'bundle', config.manifest.mainModule))).size > 0);
const assets = resolve(worker, 'assets');
const html = await readFile(resolve(assets, 'index.html'), 'utf8');
assert(html.includes('id="testForm"'), 'Build must contain the canonical frontend');
assert(!html.includes('http-equiv="refresh"'), 'The compatibility redirect must not be deployed as the app');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)];
assert(scripts.length > 0, 'Built frontend must have a script entry');
for (const [_, url] of scripts) {
  assert(url.startsWith('/assets/'), 'Worker frontend scripts must be local hashed assets');
  const content = await readFile(resolve(assets, '.' + url), 'utf8');
  assert(!content.includes('/__test__/stream'), 'Test fixtures must not be shipped');
}
console.log('Worker output verified: backend bundle, ASSETS binding, canonical frontend, no development flags or test fixtures.');

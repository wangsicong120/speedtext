import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { frontendEntry } from '../../scripts/vite-frontend.js';

test('the Worker root entry uses the canonical frontend, including normalized Windows paths', async () => {
  const filename = fileURLToPath(new URL('../../index.html', import.meta.url)).replaceAll('\\', '/');
  const html = await frontendEntry().transformIndexHtml.handler('legacy redirect', { filename });
  assert(html.includes('id="testForm"'));
  assert(html.includes('src="./frontend/js/app.js"'));
  assert(html.includes('href="./frontend/styles.css"'));
  assert(!html.includes('http-equiv="refresh"'));
});

test('the frontend entry hook does not replace other HTML pages', async () => {
  assert.equal(await frontendEntry().transformIndexHtml.handler('unchanged', { filename: 'another.html' }), 'unchanged');
  assert.equal(await frontendEntry().transformIndexHtml.handler('unchanged', { path: '/other.html', server: {} }), 'unchanged');
});

test('Cloudflare development absolute paths use the canonical page and normalize the Vite context', async () => {
  const filename = fileURLToPath(new URL('../../index.html', import.meta.url)).replaceAll('\\', '/');
  const context = { path: filename, filename: resolve(dirname(filename), '.' + filename), server: {} };
  const html = await frontendEntry().transformIndexHtml.handler('legacy redirect', context);
  assert(html.includes('id="testForm"'));
  assert(!html.includes('http-equiv="refresh"'));
  assert.equal(context.path, '/index.html');
  assert.equal(context.filename, fileURLToPath(new URL('../../index.html', import.meta.url)));
});

test('standard Vite development URLs keep correct root-relative frontend assets', async () => {
  const filename = fileURLToPath(new URL('../../index.html', import.meta.url));
  const context = { path: '/index.html', filename, server: {} };
  const html = await frontendEntry().transformIndexHtml.handler('legacy redirect', context);
  assert(html.includes('src="./frontend/js/app.js"'));
  assert.equal(context.path, '/index.html');
  assert.equal(context.filename, filename);
});

import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import worker from '../backend/worker.js';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

export function assetBinding(root, { source = false } = {}) {
  return {
    async fetch(request) {
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad path', { status: 400 }); }
      if (/[\\\u0000-\u001f\u007f]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.')) || pathname.endsWith('/_headers')) {
        return new Response('Not found', { status: 404 });
      }
      let path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      let boundary = root;
      if (source && pathname === '/shared/limits.js') { path = resolve(project, 'shared/limits.js'); boundary = resolve(project, 'shared'); }
      if (!path.startsWith(boundary + sep)) return new Response('Not found', { status: 404 });
      try {
        const actual = await realpath(path), base = await realpath(boundary);
        if (!actual.startsWith(base + sep) || !(await stat(actual)).isFile()) return new Response('Not found', { status: 404 });
        const body = request.method === 'HEAD' ? null : await readFile(actual);
        return new Response(body, { headers: { 'Content-Type': MIME[extname(actual)] || 'application/octet-stream', 'Cache-Control': 'no-cache' } });
      } catch { return new Response('Not found', { status: 404 }); }
    }
  };
}

export function localServer({ built = false, fixtures = false } = {}) {
  const root = resolve(project, built ? 'dist/client' : 'frontend');
  const assets = assetBinding(root, { source: !built });
  return createServer(async (incoming, outgoing) => {
    try {
      const address = 'http://127.0.0.1:' + incoming.socket.localPort;
      const url = new URL(incoming.url, address);
      // 仅显式 --fixtures 的本地测试服务器提供模拟流；不会进入 Worker 构建。
      if (fixtures && url.pathname === '/__test__/stream') {
        const status = Number(url.searchParams.get('status')) || 200;
        outgoing.writeHead([200, 403, 404, 500].includes(status) ? status : 400,
          { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
        if (status !== 200) { outgoing.end('Fixture error'); return; }
        if (url.searchParams.get('stall') === '1') { outgoing.flushHeaders(); return; }
        const chunk = Buffer.alloc(64 * 1024, 7);
        const period = url.searchParams.get('slow') === '1' ? 200 : 25;
        const timer = setInterval(() => {
          if (!outgoing.destroyed && !outgoing.writableNeedDrain) outgoing.write(chunk);
        }, period);
        outgoing.on('close', () => clearInterval(timer));
        return;
      }
      const request = new Request(url, { method: incoming.method, headers: incoming.headers });
      const response = await worker.fetch(request, { ASSETS: assets, LOCAL_DEV: true });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(outgoing); else outgoing.end();
    } catch { if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end('Local server error'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port');
  const server = localServer({ built: process.argv.includes('--built'), fixtures: process.argv.includes('--fixtures') });
  server.listen(port, '127.0.0.1', () => console.log(`Speedtext local server: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}

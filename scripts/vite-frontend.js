import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootEntry = fileURLToPath(new URL('../index.html', import.meta.url));
const frontendHtml = new URL('../frontend/index.html', import.meta.url);

// 单一页面源：开发和 Worker 构建使用 frontend/，根 HTML 仅供旧静态入口跳转。
export function frontendEntry() {
  return {
    name: 'speedtext-frontend-entry',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, context) {
        const matchesFile = context.filename && resolve(context.filename) === rootEntry;
        // beta Cloudflare 插件向 Vite 传入绝对文件路径，而 Vite 期望页面 URL。
        const matchesDevPath = context.server && context.path && resolve(context.path) === rootEntry;
        if (!matchesFile && !matchesDevPath) return html;
        if (context.server) {
          // 后续 Vite HTML hook 也使用此上下文，避免生成错误的模块预加载路径。
          context.path = '/index.html';
          context.filename = rootEntry;
        }
        return (await readFile(frontendHtml, 'utf8')).replace(/\b(href|src)="\.\//g, '$1="./frontend/');
      }
    }
  };
}

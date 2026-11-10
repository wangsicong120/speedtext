import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';
import { frontendEntry } from './scripts/vite-frontend.js';

export default defineConfig({
  // cf 与 beta 插件都按 Vite root 读取配置并写入 Build Output。
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('./frontend/public', import.meta.url)),
  plugins: [frontendEntry(), cloudflare({ remoteBindings: false })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2022' }
});

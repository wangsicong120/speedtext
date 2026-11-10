import { bindings, defineConfig } from 'cf/config';

export default defineConfig(({ mode, isPreview }) => ({
  worker: {
    name: 'speedtext',
    entrypoint: './backend/worker.js',
    compatibilityDate: '2026-11-10',
    env: {
      ASSETS: bindings.assets(),
      // 本地 workerd 会模拟 request.cf；不将模拟的 IP/归属当作真实边缘信息。
      ...(mode === 'development' && !isPreview ? { LOCAL_DEV: bindings.json(true) } : {})
    },
    assets: { runWorkerFirst: true, notFoundHandling: 'none' },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 0.1, invocationLogs: false },
      traces: { enabled: true, headSamplingRate: 0.1 }
    }
  }
}));

import { abortError } from './utils.js';

// 包括第三方文本在内，所有小响应都有读取上限；超时覆盖整个响应体。
export async function readTextLimited(response, maxBytes = 32768) {
  if (!response.body?.getReader) throw new Error('响应不可读取');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('响应超过安全读取上限');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
  }
}

export async function fetchSmall(url, { signal, timeoutMs = 8000, fetchImpl = globalThis.fetch,
  now = () => performance.now(), maxBytes = 32768 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw abortError();
    const started = now();
    const response = await fetchImpl(url, { mode: 'cors', cache: 'no-store', credentials: 'omit',
      referrerPolicy: 'no-referrer', signal: controller.signal });
    const latency = Math.round(now() - started);
    if (!response.ok) {
      try { await response.body?.cancel(); } catch {}
      throw new Error('HTTP ' + response.status);
    }
    const text = await readTextLimited(response, maxBytes);
    if (controller.signal.aborted) throw abortError();
    return { text, latency };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new Error('请求或读取超时');
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
  }
}

const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) : '';

export class NetworkPanel {
  constructor({ onLatency = () => {} } = {}) {
    this.onLatency = onLatency;
    this.latency = null;
    this.clientController = null;
    this.ipController = null;
    this.connectController = null;
    this.heartbeatController = null;
    this.$ = id => document.getElementById(id);
    this.$('refreshNetwork').addEventListener('click', () => this.refresh());
    this.$('queryExternalIp').addEventListener('click', () => this.queryIp());
    this.$('checkConnectivity').addEventListener('click', () => this.checkConnectivity());
  }

  output(id, text, state = '') {
    const node = this.$(id);
    node.textContent = text;
    node.className = state ? 'r-' + state : '';
  }

  async refresh() {
    if (this.clientController) return;
    const controller = new AbortController(); this.clientController = controller;
    this.$('refreshNetwork').disabled = true;
    this.output('ipCurrent', '读取中…'); this.output('ipLocation', '读取中…');
    try {
      const { text, latency } = await fetchSmall('/api/client', { signal: controller.signal });
      const info = JSON.parse(text);
      if (!info || !['cloudflare', 'local'].includes(info.source)) throw new Error('API 响应无效');
      this.latency = latency; this.onLatency(latency);
      this.output('localLatency', latency + ' ms', 'ok');
      this.output('ipCurrent', cleanText(info.ip) || (info.source === 'local' ? '本地开发模式，不显示真实 IP' : '边缘未提供 IP'));
      this.output('ipLocation', [info.country, info.region, info.city, info.organization, info.colo].map(cleanText).filter(Boolean).join(' · ') || '暂无边缘信息');
      this.$('networkStatus').textContent = info.source === 'local' ? '本地模式不信任伪造的转发头；部署到 Workers 后显示边缘信息。' : '本站信息已更新；第三方查询仍需手动触发。';
    } catch (error) {
      this.latency = null; this.onLatency(null);
      this.output('ipCurrent', '本站 API 不可用（静态模式或网络异常）', 'warn');
      this.output('ipLocation', '下载与节点管理仍可使用'); this.output('localLatency', '未测得', 'warn');
      this.$('networkStatus').textContent = error?.name === 'AbortError' ? '本站查询已取消。' : '可点击“刷新本站信息”重试；静态托管不提供边缘 IP API。';
    } finally {
      if (this.clientController === controller) this.clientController = null;
      this.$('refreshNetwork').disabled = false;
    }
  }

  async heartbeat() {
    if (this.heartbeatController) return;
    const controller = new AbortController(); this.heartbeatController = controller;
    try {
      const { text, latency } = await fetchSmall('/api/health', { signal: controller.signal, timeoutMs: 5000 });
      if (JSON.parse(text).ok !== true) throw new Error('健康检查不可用');
      this.latency = latency; this.onLatency(latency); this.output('localLatency', latency + ' ms', 'ok');
    } catch {
      this.latency = null; this.onLatency(null); this.output('localLatency', '未测得', 'warn');
    } finally { if (this.heartbeatController === controller) this.heartbeatController = null; }
  }

  async queryIp() {
    if (this.ipController) { this.ipController.abort(); return; }
    const controller = new AbortController(); this.ipController = controller;
    const button = this.$('queryExternalIp'); button.textContent = '停止 IP 查询';
    this.$('networkStatus').textContent = '正在请求 ipip.net 和 ipinfo.io；仅本次查询，不会自动轮询。';
    await Promise.allSettled([
      this.externalIp('ipcn', 'https://myip.ipip.net/', false, controller.signal),
      this.externalIp('ipgb', 'https://ipinfo.io/json', true, controller.signal)
    ]);
    if (this.ipController === controller) this.ipController = null;
    button.textContent = '查询多路出口 IP';
    this.$('networkStatus').textContent = controller.signal.aborted ? 'IP 查询已取消。' : '本次 IP 查询结束。失败可能由 CORS、限流或网络限制引起。';
  }

  async externalIp(id, url, json, signal) {
    this.output(id, '查询中…');
    try {
      const { text } = await fetchSmall(url, { signal });
      let message;
      if (json) {
        const info = JSON.parse(text);
        message = [info?.ip, info?.city, info?.region, info?.country, info?.org].map(cleanText).filter(Boolean).join(' · ');
      } else message = cleanText(text.replace(/\s+/g, ' ').trim());
      this.output(id, message || '服务未返回 IP 信息', message ? 'ok' : 'warn');
    } catch (error) { this.output(id, error?.name === 'AbortError' ? '已取消' : '查询失败（跨域、限流或超时）', 'warn'); }
  }

  async checkConnectivity() {
    if (this.connectController) { this.connectController.abort(); return; }
    const controller = new AbortController(); this.connectController = controller;
    const button = this.$('checkConnectivity'); button.textContent = '停止连通性检测';
    const targets = [
      ['laycn', 'https://www.baidu.com/favicon.ico'], ['laygb', 'https://www.cloudflare.com/favicon.ico'],
      ['laygh', 'https://github.com/favicon.ico'], ['layyt', 'https://www.youtube.com/favicon.ico']
    ];
    await Promise.allSettled(targets.map(async ([id, url]) => {
      this.output(id, '检测中…');
      const child = new AbortController();
      const abort = () => child.abort(); controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 5000), started = performance.now();
      try {
        const response = await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit',
          referrerPolicy: 'no-referrer', signal: child.signal });
        if (child.signal.aborted) throw abortError();
        this.output(id, Math.round(performance.now() - started) + ' ms（响应到达）', 'ok');
        try { await response.body?.cancel(); } catch {}
      } catch { this.output(id, controller.signal.aborted ? '已取消' : '未测得（超时或网络限制）', 'warn'); }
      finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); child.abort(); }
    }));
    if (this.connectController === controller) this.connectController = null;
    button.textContent = '检测第三方连通性';
    this.$('networkStatus').textContent = controller.signal.aborted ? '连通性检测已取消。' : '本次连通性检测结束。跨域响应到达不等于 HTTP 成功或服务可登录。';
  }

  stopAll() {
    for (const controller of [this.clientController, this.ipController, this.connectController, this.heartbeatController]) controller?.abort();
  }
}

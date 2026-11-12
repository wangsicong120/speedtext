import { LIMITS } from '../../shared/limits.js';
import { abortError, readStorage, writeStorage } from './utils.js';

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

export function isIpAddress(value) {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split('.').every(part => +part <= 255);
  if (!/^[a-f0-9:]+$/i.test(value) || !value.includes(':')) return false;
  try { return new URL('https://[' + value + ']/').hostname.startsWith('['); } catch { return false; }
}

export function parseExternalIp(text, json = false) {
  if (json) {
    const info = JSON.parse(text);
    if (!info || Array.isArray(info) || !isIpAddress(info.ip)) throw new Error('服务未返回有效 IP');
    const location = [info.city, info.region, info.country, info.org].map(cleanText).filter(Boolean).join(' · ');
    const locationLabel = [info.region, info.city].map(cleanText).filter(Boolean).join(' ') || cleanText(info.country);
    return { ip: info.ip, location, locationLabel, organization: cleanText(info.org), message: [info.ip, location].filter(Boolean).join(' · ') };
  }
  const message = cleanText(text.replace(/\s+/g, ' ').trim());
  const ip = isIpAddress(message) ? message : message.match(/IP\s*[:：]\s*([a-f0-9:.]+)/i)?.[1];
  if (!isIpAddress(ip)) throw new Error('服务未返回有效 IP');
  const location = message.includes('来自') ? message.split(/来自\s*[:：]\s*/)[1] || '' : '';
  return { ip, message, location, locationLabel: location, organization: '' };
}

const targets = [
  ['laycn', 'https://www.baidu.com/favicon.ico'], ['laygb', 'https://www.cloudflare.com/favicon.ico'],
  ['laygh', 'https://github.com/favicon.ico'], ['layyt', 'https://www.youtube.com/favicon.ico']
];

export class NetworkPanel {
  constructor({ onInfo = () => {}, fetchImpl = globalThis.fetch, documentRef = globalThis.document,
    isOnline = () => globalThis.navigator.onLine, now = () => performance.now(), wallNow = () => Date.now(),
    intervalMs = LIMITS.networkRefreshMs, requestTimeoutMs = 8000, connectivityTimeoutMs = 5000,
    setTimer = setTimeout, clearTimer = clearTimeout, read = readStorage, write = writeStorage } = {}) {
    // 原生 Window API 若作为类成员直接调用会产生 Illegal invocation。
    this.onInfo = onInfo; this.fetch = (...args) => fetchImpl(...args); this.document = documentRef;
    this.isOnline = isOnline; this.now = now; this.wallNow = wallNow;
    this.intervalMs = intervalMs; this.requestTimeoutMs = requestTimeoutMs;
    this.connectivityTimeoutMs = connectivityTimeoutMs;
    this.setTimer = (...args) => setTimer(...args); this.clearTimer = timer => clearTimer(timer);
    this.write = write; this.$ = id => documentRef.getElementById(id);
    this.latency = null; this.request = null; this.heartbeatController = null; this.timer = null;
    this.started = false; this.paused = false; this.lastUpdated = null; this.sourceNote = '';
    this.apiAvailable = null; this.apiRetryAt = 0; this.ipinfoRetryAt = 0;
    this.enabled = read('tk_network_auto', true) !== false;
    this.$('autoNetwork').checked = this.enabled;
    const base = new URL(documentRef.baseURI);
    const icon = new URL(documentRef.querySelector('link[rel="icon"]')?.getAttribute('href') || './favicon.svg', base);
    this.staticProbeUrl = icon.origin === base.origin ? icon.href : new URL('./favicon.svg', base).href;
    this.$('refreshNetwork').addEventListener('click', () => {
      if (this.request) this.cancelRefresh(); else this.refresh({ force: true });
    });
    this.$('autoNetwork').addEventListener('change', () => this.setAutomatic(this.$('autoNetwork').checked));
  }

  output(id, text, state = '') {
    const node = this.$(id); node.textContent = text; node.className = state ? 'r-' + state : '';
  }

  status(text) {
    if (this.$('networkStatus').textContent !== text) this.$('networkStatus').textContent = text;
  }

  canPoll() { return this.started && !this.paused && this.document.visibilityState === 'visible' && this.isOnline(); }

  summary() {
    return (this.enabled ? '自动刷新已开启（约 30 秒；后台或离线暂停）。' : '自动刷新已关闭，可点击“立即刷新”。') +
      (this.sourceNote ? ' ' + this.sourceNote : '') + ' 跨域响应到达不等于 HTTP 成功或服务可登录。';
  }

  clearSchedule() { if (this.timer !== null) this.clearTimer(this.timer); this.timer = null; }

  schedule() {
    this.clearSchedule();
    if (this.enabled && this.canPoll() && !this.request) {
      this.timer = this.setTimer(() => { this.timer = null; this.refresh({ automatic: true }); }, this.intervalMs);
    }
  }

  start() { this.started = true; this.resume(); }

  setAutomatic(enabled) {
    this.enabled = enabled === true; this.$('autoNetwork').checked = this.enabled;
    this.write('tk_network_auto', this.enabled); this.clearSchedule();
    if (!this.enabled && this.request?.automatic) this.cancelRefresh();
    if (this.enabled && this.canPoll()) this.refresh({ automatic: true });
    else this.status(this.summary());
  }

  pause(reason = 'hidden') {
    this.paused = true; this.stopAll();
    this.latency = null;
    this.status(reason === 'offline' ? '网络离线，自动更新已暂停；之前结果可能过期。' : '页面后台或已离开，自动更新已暂停；之前结果可能过期。');
  }

  resume(force = false) {
    const wasPaused = this.paused;
    this.paused = false;
    if (!this.canPoll()) return;
    if (this.enabled) {
      if (force || wasPaused || this.lastUpdated === null || this.timer === null) this.refresh({ automatic: true, force });
    } else this.status(this.summary());
  }

  stopAll() {
    this.clearSchedule();
    const request = this.request; this.request = null; request?.controller.abort();
    const heartbeat = this.heartbeatController; this.heartbeatController = null; heartbeat?.abort();
    this.$('refreshNetwork').textContent = '立即刷新';
    if (request && this.lastUpdated === null) {
      for (const id of ['ipCurrent', 'ipcn', 'ipgb', 'laycn', 'laygb', 'laygh', 'layyt']) this.output(id, '尚未测得', 'warn');
    }
  }

  cancelRefresh() {
    this.stopAll();
    if (this.lastUpdated === null) {
      for (const id of ['ipCurrent', 'ipcn', 'ipgb', 'laycn', 'laygb', 'laygh', 'layyt']) this.output(id, '已取消', 'warn');
      this.output('networkChecked', '本轮已取消');
    }
    this.status('本轮检测已取消。' + this.summary()); this.schedule();
  }

  current(request) { return this.request === request && !request.controller.signal.aborted; }

  small(url, signal) {
    return fetchSmall(url, { signal, fetchImpl: this.fetch, timeoutMs: this.requestTimeoutMs, now: this.now });
  }

  async staticClient(signal) {
    try {
      const { latency } = await this.small(this.staticProbeUrl, signal);
      return { available: false, source: 'static', latency };
    } catch (error) { if (signal.aborted) throw abortError(); return { available: false, source: 'static', latency: null }; }
  }

  async readClient(signal, force) {
    if (!force && this.apiAvailable === false && this.wallNow() < this.apiRetryAt) {
      return { ...await this.staticClient(signal), retryAt: this.apiRetryAt };
    }
    try {
      const { text, latency } = await this.small('/api/client', signal);
      const info = JSON.parse(text);
      if (!info || !['cloudflare', 'local'].includes(info.source)) throw new Error('API 响应无效');
      return { available: true, source: info.source, ip: isIpAddress(info.ip) ? info.ip : null, latency,
        locationLabel: [info.region, info.city].map(cleanText).filter(Boolean).join(' ') || cleanText(info.country),
        organization: cleanText(info.organization),
        location: [info.country, info.region, info.city, info.organization, info.colo].map(cleanText).filter(Boolean).join(' · ') };
    } catch (error) {
      if (signal.aborted) throw abortError();
      return { ...await this.staticClient(signal), retryAt: this.wallNow() + 5 * 60 * 1000 };
    }
  }

  async readExternal(url, json, signal, provider) {
    try {
      const { text } = await this.small(url, signal);
      return { ok: true, ...parseExternalIp(text, json), provider };
    } catch (error) {
      if (signal.aborted) throw abortError();
      return { ok: false, message: '未测得（跨域、限流或超时）', provider };
    }
  }

  async readGlobal(signal, force) {
    let retryAt = this.ipinfoRetryAt;
    if (force || this.wallNow() >= this.ipinfoRetryAt) {
      const result = await this.readExternal('https://ipinfo.io/json', true, signal, 'ipinfo.io');
      if (result.ok) return { ...result, retryAt: 0 };
      retryAt = this.wallNow() + 5 * 60 * 1000;
    }
    const result = await this.readExternal('https://api64.ipify.org?format=json', true, signal, 'ipify');
    return { ...result, retryAt };
  }

  async connectivity(signal) {
    return Promise.all(targets.map(async ([id, url]) => {
      const child = new AbortController(), abort = () => child.abort();
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) child.abort();
      const timer = setTimeout(abort, this.connectivityTimeoutMs), started = this.now();
      let response;
      try {
        if (child.signal.aborted) throw abortError();
        response = await this.fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit',
          referrerPolicy: 'no-referrer', signal: child.signal });
        if (child.signal.aborted) throw abortError();
        const opaque = response.type === 'opaque';
        return { id, ok: opaque || response.ok, message: Math.round(this.now() - started) +
          (opaque ? ' ms' : ' ms（HTTP ' + response.status + '，响应到达）') };
      } catch { return { id, ok: false, message: signal.aborted ? '已取消' : '未测得（超时或网络限制）' }; }
      finally {
        clearTimeout(timer); signal.removeEventListener('abort', abort); child.abort();
        try { await response?.body?.cancel(); } catch {}
      }
    }));
  }

  setLatency(latency) {
    this.latency = Number.isFinite(latency) ? latency : null;
    this.output('localLatency', this.latency === null ? '未测得' : this.latency + ' ms', this.latency === null ? 'warn' : 'ok');
  }

  refresh({ automatic = false, force = false } = {}) {
    if (this.request) return this.request.promise;
    if (!this.canPoll()) return Promise.resolve();
    this.clearSchedule(); this.heartbeatController?.abort(); this.heartbeatController = null;
    const request = { controller: new AbortController(), automatic, promise: null }; this.request = request;
    this.$('refreshNetwork').textContent = '停止检测';
    if (this.lastUpdated === null) {
      for (const id of ['ipCurrent', 'ipcn', 'ipgb', 'laycn', 'laygb', 'laygh', 'layyt']) this.output(id, '检测中…');
    }
    if (!automatic || this.lastUpdated === null) this.status('正在检测出口 IP 与连通性；只请求小响应，不会启动下载。');
    const signal = request.controller.signal;
    request.promise = (async () => {
      try {
        const [client, domestic, global, connections] = await Promise.all([
          this.readClient(signal, force), this.readExternal('https://myip.ipip.net/', false, signal, 'ipip.net'),
          this.readGlobal(signal, force), this.connectivity(signal)
        ]);
        if (!this.current(request)) return;
        this.apiAvailable = client.available;
        this.apiRetryAt = client.available ? 0 : client.retryAt;
        this.ipinfoRetryAt = global.retryAt;
        this.setLatency(client.latency);
        for (const [id, result] of [['ipcn', domestic], ['ipgb', global]]) {
          this.output(id, result.message + ' · ' + result.provider, result.ok ? 'ok' : 'warn');
        }
        const external = global.ok ? global : domestic.ok ? domestic : null;
        if (client.source === 'cloudflare' && client.ip) {
          this.output('ipCurrent', client.ip, 'ok'); this.output('ipSource', '本站边缘（Cloudflare）');
          this.output('ipLocation', client.location || '暂无归属信息');
          this.onInfo({ ip: client.ip, location: client.locationLabel || '暂无归属信息', organization: client.organization, source: '本站边缘' });
          this.sourceNote = '当前 IP 来自本站边缘请求。';
        } else if (external) {
          this.output('ipCurrent', external.ip, 'ok'); this.output('ipSource', '第三方 · ' + external.provider);
          this.output('ipLocation', external.location || (domestic.ok && domestic.ip === external.ip ? domestic.location : '') || '该服务未提供归属信息');
          this.onInfo({ ip: external.ip,
            location: external.locationLabel || (domestic.ok && domestic.ip === external.ip ? domestic.location : '') || '暂无归属信息',
            organization: external.organization, source: '第三方' });
          this.sourceNote = client.source === 'local' ? '本地模式已回退到第三方 IP 检测，未使用伪造转发头。' :
            client.available ? '本站边缘未提供有效 IP，已回退到第三方检测。' : '静态页面或本站 API 暂不可用，已使用第三方 IP 检测。';
        } else {
          this.output('ipCurrent', '暂未测得出口 IP', 'warn'); this.output('ipSource', '检测失败');
          this.output('ipLocation', '可稍后刷新，或检查网络 / 扩展限制');
          this.onInfo(null);
          this.sourceNote = 'IP 服务暂未返回可读结果，下载功能仍可使用。';
        }
        for (const result of connections) this.output(result.id, result.message, result.ok ? 'ok' : 'warn');
        this.lastUpdated = this.wallNow();
        this.output('networkChecked', new Date(this.lastUpdated).toLocaleTimeString('zh-CN', { hour12: false }));
        this.status(this.summary());
      } catch (error) {
        if (this.current(request)) this.status('本轮检测未完成，可稍后刷新。' + this.summary());
      } finally {
        request.controller.abort();
        if (this.request === request) {
          this.request = null; this.$('refreshNetwork').textContent = '立即刷新'; this.schedule();
        }
      }
    })();
    return request.promise;
  }

  async heartbeat() {
    if (!this.canPoll() || this.heartbeatController || this.request) return;
    const controller = new AbortController(); this.heartbeatController = controller;
    try {
      let result;
      if (this.apiAvailable !== false) {
        try {
          result = await this.small('/api/health', controller.signal);
          if (JSON.parse(result.text).ok !== true) throw new Error('健康检查不可用');
        } catch (error) {
          if (controller.signal.aborted) throw abortError();
          result = await this.small(this.staticProbeUrl, controller.signal);
          if (this.heartbeatController === controller) { this.apiAvailable = false; this.apiRetryAt = this.wallNow() + 5 * 60 * 1000; }
        }
      } else result = await this.small(this.staticProbeUrl, controller.signal);
      if (this.heartbeatController === controller && !controller.signal.aborted) this.setLatency(result.latency);
    } catch {
      if (this.heartbeatController === controller && !controller.signal.aborted) this.setLatency(null);
    } finally {
      controller.abort(); if (this.heartbeatController === controller) this.heartbeatController = null;
    }
  }
}

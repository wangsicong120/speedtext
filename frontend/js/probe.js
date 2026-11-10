import { LIMITS } from '../../shared/limits.js';
import { deduplicate, normalizeUrl, requestUrl } from './utils.js';

export function sanitizeProbeResult(value) {
  if (!value || typeof value !== 'object' || !['ok', 'small', 'error', 'timeout', 'cancelled'].includes(value.status)) return null;
  const number = input => Number.isFinite(input) && input >= 0 && input <= Number.MAX_SAFE_INTEGER ? input : 0;
  const sampledAt = typeof value.sampledAt === 'string' && Number.isFinite(Date.parse(value.sampledAt)) ? value.sampledAt : null;
  if (!sampledAt) return null;
  return { status: value.status, message: typeof value.message === 'string' ? value.message.slice(0, 200) : '',
    bytes: number(value.bytes), speed: number(value.speed), elapsedMs: number(value.elapsedMs),
    firstByteMs: value.firstByteMs === null ? null : number(value.firstByteMs), sampledAt };
}

export async function probeDownload(item, { fetchImpl = globalThis.fetch, now = () => performance.now(),
  signal, maxBytes = LIMITS.probeMaxBytes, timeoutMs = LIMITS.probeTimeoutMs, cacheBust = false } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false, reader = null, response = null, bytes = 0, firstByteMs = null;
  const started = now();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const result = (status, message) => {
    const elapsedMs = Math.max(1, now() - started);
    return { status, message, bytes, firstByteMs, elapsedMs: Math.round(elapsedMs),
      speed: bytes / (elapsedMs / 1000), sampledAt: new Date().toISOString() };
  };
  try {
    const url = normalizeUrl(item.url);
    if (controller.signal.aborted) return result('cancelled', '已取消');
    response = await fetchImpl(requestUrl(url, cacheBust), {
      mode: 'cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'follow', signal: controller.signal
    });
    if (controller.signal.aborted) return result(timedOut ? 'timeout' : 'cancelled', timedOut ? '连接超时' : '已取消');
    if (!response.ok) return result('error', 'HTTP ' + response.status);
    if (response.url) normalizeUrl(response.url);
    if (!response.body?.getReader) return result('error', '不支持流式读取');
    reader = response.body.getReader();
    while (!controller.signal.aborted) {
      const chunk = await reader.read();
      if (controller.signal.aborted) break;
      if (chunk.done) {
        return result(bytes === 0 ? 'error' : bytes < 64 * 1024 ? 'small' : 'ok',
          bytes === 0 ? '空响应' : bytes < 64 * 1024 ? '小文件，仅作可读性参考' : '可读，采样完成');
      }
      const size = chunk.value?.byteLength || 0;
      if (!size) continue;
      if (firstByteMs === null) firstByteMs = Math.round(now() - started);
      bytes += size;
      if (bytes >= maxBytes) return result('ok', '可读，达到采样上限');
    }
    return result(timedOut ? 'timeout' : 'cancelled', timedOut ? '读取超时' : '已取消');
  } catch (error) {
    if (signal?.aborted) return result('cancelled', '已取消');
    if (timedOut) return result('timeout', bytes ? '读取超时（已有部分数据）' : '连接超时');
    return result('error', error?.name === 'TypeError' ? 'CORS 限制或网络不可达' : error?.message || '请求失败');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
    if (reader) {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); } catch {}
    } else if (response?.body && !response.body.locked) {
      try { await response.body.cancel(); } catch {}
    }
  }
}

export class ProbeQueue {
  constructor({ probe = probeDownload, concurrency = LIMITS.probeConcurrency } = {}) {
    this.probe = probe;
    this.concurrency = Math.max(1, Math.min(LIMITS.probeConcurrency, Math.trunc(concurrency) || 1));
    this.session = null;
  }

  get running() { return !!this.session?.active; }

  stop() {
    if (!this.running) return false;
    this.session.active = false;
    this.session.cancelled = true;
    this.session.controller.abort();
    this.session.notify();
    return true;
  }

  async run(items, { onProgress = () => {}, onResult = () => {} } = {}) {
    if (this.running) throw new Error('请先停止当前检测。');
    const list = deduplicate(items);
    const session = { active: true, cancelled: false, controller: new AbortController(), completed: 0,
      total: list.length, bytes: 0, next: 0, results: new Map(), notify: null };
    this.session = session;
    session.notify = () => {
      if (this.session === session) onProgress({ running: session.active, cancelled: session.cancelled,
        completed: session.completed, total: session.total, bytes: session.bytes });
    };
    session.notify();
    const worker = async () => {
      while (session.active && this.session === session && session.next < list.length) {
        const item = list[session.next++];
        const result = await this.probe(item, { signal: session.controller.signal });
        // 取消后的迟到响应不能覆盖新检测的结果、进度或流量。
        if (!session.active || this.session !== session) return;
        session.results.set(item.url, result);
        session.completed++; session.bytes += result.bytes || 0;
        onResult(item, result); session.notify();
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(this.concurrency, list.length) }, worker)); }
    finally {
      session.active = false; session.controller.abort(); session.notify();
    }
    return { completed: session.completed, total: session.total, bytes: session.bytes,
      cancelled: session.cancelled, results: session.results };
  }
}

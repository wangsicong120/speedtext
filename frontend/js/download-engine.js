import { LIMITS } from '../../shared/limits.js';
import { clampThreads, delay, normalizeUrl, requestUrl } from './utils.js';

export class DownloadEngine {
  constructor({ fetchImpl = globalThis.fetch, now = () => performance.now(), onState = () => {},
    idleTimeoutMs = LIMITS.idleTimeoutMs, retryBaseMs = 500, maxFailures = 3 } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.onState = onState;
    this.idleTimeoutMs = idleTimeoutMs;
    this.retryBaseMs = retryBaseMs;
    this.maxFailures = maxFailures;
    this.session = null;
  }

  get running() { return !!this.session?.active; }

  start({ url, threads = LIMITS.defaultThreads, maxBytes = LIMITS.defaultMaxBytes,
    durationSeconds = LIMITS.defaultDurationSeconds, cacheBust = false }) {
    if (this.running) return false;
    url = normalizeUrl(url);
    const max = Number(maxBytes), duration = Number(durationSeconds);
    if (!Number.isFinite(max) || max < 0 || max > LIMITS.maxMiB * 1024 * 1024 ||
        !Number.isFinite(duration) || duration < 0 || duration > LIMITS.maxDurationSeconds) {
      throw new Error('流量和时长限制必须为大于或等于 0 的有效数字。');
    }
    const session = {
      active: true, url, threads: clampThreads(threads), maxBytes: max, durationSeconds: duration,
      cacheBust, controller: new AbortController(), controllers: new Set(), tasks: new Set(),
      bytes: 0, started: this.now(), ended: null, firstByteMs: null, expanded: false,
      reason: '', error: '', lastSampleBytes: 0, lastSampleTime: this.now(), speed: 0, durationTimer: null
    };
    this.session = session;
    if (duration > 0) session.durationTimer = setTimeout(() => {
      if (session.active && session === this.session) this.stop('duration');
    }, duration * 1000);
    this.emit('connecting', session);
    this.launch(session, 0);
    return true;
  }

  launch(session, index) {
    const task = this.loop(session, index);
    session.tasks.add(task);
    task.catch(error => {
      if (session.active) this.stop('error', error?.message || '下载异常，请更换地址。');
    }).finally(() => session.tasks.delete(task));
  }

  emit(state, session = this.session) {
    if (session === this.session) this.onState({ state, ...this.snapshot(false) });
  }

  stop(reason = 'manual', error = '') {
    const session = this.session;
    if (!session?.active) return false;
    session.active = false;
    session.ended = this.now();
    session.reason = reason; session.error = error;
    clearTimeout(session.durationTimer);
    session.controller.abort();
    for (const controller of session.controllers) controller.abort();
    session.speed = 0;
    this.emit('stopped', session);
    return true;
  }

  checkLimits(session) {
    if (!session.active || session !== this.session) return true;
    if (session.maxBytes > 0 && session.bytes >= session.maxBytes) { this.stop('limit'); return true; }
    if (session.durationSeconds > 0 && this.now() - session.started >= session.durationSeconds * 1000) {
      this.stop('duration'); return true;
    }
    return false;
  }

  snapshot(sample = true) {
    const session = this.session;
    if (!session) return { running: false, bytes: 0, speed: 0, average: 0, elapsed: 0, reason: '', error: '', firstByteMs: null };
    const currentTime = session.ended ?? this.now();
    const elapsed = Math.max(0, (currentTime - session.started) / 1000);
    if (sample && session.active) {
      const dt = (currentTime - session.lastSampleTime) / 1000;
      if (dt > 0) session.speed = (session.bytes - session.lastSampleBytes) / dt;
      session.lastSampleTime = currentTime; session.lastSampleBytes = session.bytes;
    }
    return {
      running: session.active, bytes: session.bytes, speed: session.active ? session.speed : 0,
      average: session.bytes / Math.max(elapsed, 0.001), elapsed,
      firstByteMs: session.firstByteMs, reason: session.reason, error: session.error,
      url: session.url, threads: session.threads
    };
  }

  tick() { if (this.running) this.checkLimits(this.session); return this.snapshot(); }

  async settled() {
    const session = this.session;
    if (session) await Promise.allSettled([...session.tasks]);
  }

  async loop(session, index) {
    let failures = 0;
    while (session.active && session === this.session) {
      if (this.checkLimits(session)) return;
      const controller = new AbortController();
      session.controllers.add(controller);
      const abort = () => controller.abort();
      session.controller.signal.addEventListener('abort', abort, { once: true });
      let reader = null, response = null, timeout = null, stalled = false, responseBytes = 0;
      const armTimeout = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => { stalled = true; controller.abort(); }, this.idleTimeoutMs);
      };
      const requestStarted = this.now();
      let retryMs = 0;
      try {
        armTimeout();
        response = await this.fetch(requestUrl(session.url, session.cacheBust), {
          cache: 'no-store', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
          redirect: 'follow', signal: controller.signal
        });
        if (!session.active || session !== this.session) return;
        if (!response.ok) {
          const message = 'HTTP ' + response.status + '，请更换地址或稍后重试。';
          if ([400, 401, 403, 404, 410].includes(response.status)) { this.stop('error', message); return; }
          throw new Error(message);
        }
        if (response.url) normalizeUrl(response.url);
        if (!response.body?.getReader) { this.stop('error', '浏览器不支持流式下载，已停止以避免大文件占用内存。'); return; }
        reader = response.body.getReader();
        while (session.active && session === this.session) {
          const chunk = await reader.read();
          // 读取完成前可能已点击停止或开始新会话，旧数据不能污染新统计。
          if (!session.active || session !== this.session) return;
          if (chunk.done) break;
          const bytes = chunk.value?.byteLength || 0;
          if (!bytes) continue;
          armTimeout(); failures = 0; responseBytes += bytes; session.bytes += bytes;
          if (session.firstByteMs === null) {
            session.firstByteMs = Math.round(this.now() - requestStarted);
            this.emit('connected', session);
          }
          if (this.checkLimits(session)) return;
          // 首块验证成功后才扩展并发，失效地址只产生一个请求链。
          if (index === 0 && !session.expanded) {
            session.expanded = true;
            for (let worker = 1; worker < session.threads; worker++) this.launch(session, worker);
          }
        }
        if (!responseBytes) throw new Error('资源响应为空，无法测速。');
        if (responseBytes < 64 * 1024) retryMs = 250;
      } catch (error) {
        if (!session.active || session !== this.session) return;
        failures++;
        const message = stalled ? '连接或流式读取超时，请更换地址。' :
          (error?.name === 'TypeError' ? '地址受 CORS 限制或网络不可达，请选择可读的下载节点。' : error?.message || '网络请求失败。');
        if (failures >= this.maxFailures) { this.stop('error', message); return; }
        this.emit('retrying', session);
        retryMs = Math.min(10000, this.retryBaseMs * 2 ** failures) + Math.floor(Math.random() * this.retryBaseMs);
      } finally {
        clearTimeout(timeout);
        session.controller.signal.removeEventListener('abort', abort);
        controller.abort();
        if (reader) {
          try { await reader.cancel(); } catch {}
          try { reader.releaseLock(); } catch {}
        } else if (response?.body && !response.body.locked) {
          try { await response.body.cancel(); } catch {}
        }
        session.controllers.delete(controller);
      }
      if (retryMs > 0 && session.active) {
        try { await delay(retryMs, session.controller.signal); } catch (error) {
          if (error?.name !== 'AbortError') throw error;
          return;
        }
      }
    }
  }
}

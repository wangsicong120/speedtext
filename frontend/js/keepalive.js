export function silentWav() {
  const samples = 8000, buffer = new ArrayBuffer(44 + samples), view = new DataView(buffer);
  const text = (offset, value) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  text(36, 'data'); view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Blob([buffer], { type: 'audio/wav' });
}

export class KeepAlive {
  constructor(audio, onStatus = () => {}) {
    this.audio = audio; this.onStatus = onStatus; this.active = false;
    this.generation = 0; this.lock = null; this.requesting = false; this.audioUrl = null;
    this.visibility = () => { if (this.active && document.visibilityState === 'visible') this.acquire(); };
    document.addEventListener('visibilitychange', this.visibility);
  }

  start() {
    if (this.active) return;
    this.active = true; this.generation++;
    const generation = this.generation;
    if (!this.audioUrl) { this.audioUrl = URL.createObjectURL(silentWav()); this.audio.src = this.audioUrl; }
    this.onStatus('已请求静音保活；系统仍可能暂停后台页面。');
    this.audio.play().catch(() => {
      if (this.active && generation === this.generation) this.onStatus('静音播放被浏览器限制，屏幕常亮仍会尝试启用。');
    });
    this.acquire();
  }

  async acquire() {
    if (!this.active || this.lock || this.requesting || document.visibilityState !== 'visible') return;
    if (!navigator.wakeLock) { this.onStatus('浏览器不支持屏幕常亮；静音保活不能保证后台运行。'); return; }
    this.requesting = true;
    const generation = this.generation;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!this.active || generation !== this.generation) { await lock.release(); return; }
      this.lock = lock;
      lock.addEventListener('release', () => { if (this.lock === lock) this.lock = null; });
      this.onStatus('屏幕常亮已启用；系统锁屏和节电策略仍可能中断测试。');
    } catch {
      if (this.active && generation === this.generation) this.onStatus('屏幕常亮未获允许；可保持页面前台运行。');
    } finally {
      this.requesting = false;
      if (this.active && generation !== this.generation) this.acquire();
    }
  }

  stop() {
    this.active = false; this.generation++;
    this.audio.pause();
    try { this.audio.currentTime = 0; } catch {}
    const lock = this.lock; this.lock = null;
    if (lock) lock.release().catch(() => {});
    this.onStatus('保活已关闭。');
  }

  dispose() {
    this.stop(); document.removeEventListener('visibilitychange', this.visibility);
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
  }
}

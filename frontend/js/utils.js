import { LIMITS } from '../../shared/limits.js';

export function normalizeUrl(value) {
  if (typeof value !== 'string') throw new Error('请输入 HTTPS 下载地址。');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('地址不能包含控制字符，请重新填写。');
  const text = value.trim();
  if (!text || text.length > LIMITS.maxUrlLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error('地址为空、过长或包含控制字符，请重新填写。');
  }
  let url;
  try { url = new URL(text); } catch { throw new Error('地址格式无效，例如 https://example.com/file.bin。'); }
  if (url.protocol !== 'https:') throw new Error('仅支持 HTTPS 地址，避免混合内容和明文传输。');
  if (url.username || url.password) throw new Error('地址不能包含用户名或密码。');
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host) ||
      /(^|\.)(localhost|local|localdomain|internal|lan|home|invalid)$/.test(host) || host.endsWith('.home.arpa')) {
    throw new Error('请使用公开域名，不能请求本机、内网或 IP 字面地址。');
  }
  if (host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) {
    throw new Error('域名格式无效，请检查地址。');
  }
  url.hash = '';
  return url.href;
}

export function requestUrl(url, cacheBust = false) {
  const parsed = new URL(url);
  parsed.hash = '';
  // 默认不修改查询参数，保留签名下载链接；缓存绕过必须由用户显式开启。
  if (cacheBust) parsed.searchParams.set('_tk', crypto.randomUUID());
  return parsed.href;
}

export function clampThreads(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(LIMITS.maxThreads, number)) : LIMITS.defaultThreads;
}

export function formatBytes(value) {
  let number = Number(value);
  if (!Number.isFinite(number) || number < 0) number = 0;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let index = 0;
  while (number >= 1024 && index < units.length - 1) { number /= 1024; index++; }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: index >= 3 ? 2 : (index ? 1 : 0) }).format(number) + ' ' + units[index];
}

export const formatSpeed = value => formatBytes(value) + '/s';

export function deduplicate(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url); return true;
  });
}

export function readStorage(key, fallback) {
  try { const text = localStorage.getItem(key); return text === null ? fallback : JSON.parse(text); }
  catch { return fallback; }
}

export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function abortError() { return new DOMException('Operation aborted', 'AbortError'); }

export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(abortError()); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

export async function copyText(text) {
  if (!navigator.clipboard || !window.isSecureContext) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

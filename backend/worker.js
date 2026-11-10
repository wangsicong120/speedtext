import { LIMITS, VERSION } from '../shared/limits.js';
import { sameOriginRequest, secureResponse } from './security.js';

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extraHeaders } });
}

const safeText = (value, length = 80) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, length) : '';

export function clientInfo(request, env = {}) {
  // Node 本地模式不信任用户伪造的 CF-/X-Forwarded-* 头；生产仅使用边缘提供的元数据。
  if (!request.cf || env.LOCAL_DEV === true) {
    return { source: 'local', ip: null, country: '', region: '', city: '', organization: '', colo: '' };
  }
  const cf = request.cf;
  const rawIp = request.headers.get('CF-Connecting-IP') || '';
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawIp) && rawIp.split('.').every(part => +part <= 255);
  const ipv6 = /^[a-f0-9:]{2,45}$/i.test(rawIp) && rawIp.includes(':');
  return {
    source: 'cloudflare', ip: ipv4 || ipv6 ? rawIp : null,
    country: safeText(cf.country, 2), region: safeText(cf.region), city: safeText(cf.city),
    organization: safeText(cf.asOrganization), colo: safeText(cf.colo, 8)
  };
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    if (!sameOriginRequest(request)) return secureResponse(json({ error: '仅允许同源 API 请求。' }, 403), request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return secureResponse(json({ error: '此 API 为只读，仅支持 GET 和 HEAD。' }, 405, { Allow: 'GET, HEAD, OPTIONS' }), request);
    }
    if (url.search || request.url.length > LIMITS.maxUrlLength) {
      return secureResponse(json({ error: 'API 不接收下载 URL 或其他查询参数。' }, 400), request);
    }
    if (request.method === 'OPTIONS') return secureResponse(new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' } }), request);
    let response;
    switch (url.pathname) {
      case '/api/health':
        response = json({ ok: true, version: VERSION }); break;
      case '/api/client':
        response = json(clientInfo(request, env)); break;
      case '/api/config':
        response = json({ version: VERSION, limits: LIMITS, arbitraryProxy: false, clientStorageOnly: true }); break;
      default:
        response = json({ error: 'API 不存在；本服务不提供任意地址代理。' }, 404);
    }
    return secureResponse(response, request);
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return secureResponse(new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } }), request);
  }
  if (!env.ASSETS?.fetch) return secureResponse(new Response('Not found', { status: 404 }), request);
  return secureResponse(await env.ASSETS.fetch(request), request);
}

export default {
  async fetch(request, env) {
    try { return await handleRequest(request, env); }
    catch (error) {
      // 不记录客户端 IP、查询参数或下载链接，避免诊断日志包含个人数据和签名令牌。
      console.error(JSON.stringify({ event: 'request_failed', error: error?.name || 'Error' }));
      return secureResponse(json({ error: '服务暂不可用，请稍后重试。' }, 500), request);
    }
  }
};

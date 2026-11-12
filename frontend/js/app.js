import { LIMITS, VERSION } from '../../shared/limits.js';
import { DownloadEngine } from './download-engine.js';
import { NodeStore } from './node-store.js';
import { ProbeQueue, fastestProbeItem, rankProbeItems, sanitizeProbeResult } from './probe.js';
import { RateChart } from './chart.js';
import { NetworkPanel } from './network.js';
import { KeepAlive } from './keepalive.js';
import { clampThreads, copyText, deduplicate, element, formatBytes, formatSpeed,
  normalizeUrl, readStorage, writeStorage } from './utils.js';

const $ = id => document.getElementById(id);
const store = new NodeStore();
const queue = new ProbeQueue();
const chart = new RateChart($('chart'));
const network = new NetworkPanel({
  onInfo: info => chart.setNetworkInfo(info)
});
const keep = new KeepAlive($('keepAudio'), text => { $('keepStatus').textContent = text; });
const engine = new DownloadEngine({ onState: engineState });
const results = new Map();
const rowResults = new Map();
const groupOpen = new Map();
let searchTimer, screenTimer, ticker = null, lastHeartbeat = 0, probeSequence = 0, runInfo = null;
let sortedResults = false;
const title = document.title;

function status(text, kind = '') {
  $('statusLine').textContent = text;
  $('statusLine').className = 'status-line' + (kind ? ' ' + kind : '');
}

function fieldError(input, output, text = '') {
  $(input).setAttribute('aria-invalid', text ? 'true' : 'false');
  $(output).textContent = text; $(output).hidden = !text;
}

function selectNode(item) {
  const previousUrl = store.current?.url;
  const node = store.select(item);
  $('curName').textContent = node.name; $('curName').title = node.name;
  $('curUrl').textContent = node.url; $('curUrl').title = node.url;
  $('diyLink').value = node.url;
  if (node.url !== previousUrl) chart.setLatency(null, document.visibilityState === 'visible' && !$('screenOff').open);
  chart.setNode(node.name);
  fieldError('diyLink', 'linkError');
  return node;
}

function validateLink(focus = false) {
  try {
    const url = normalizeUrl($('diyLink').value);
    const node = store.all().find(item => item.url === url);
    selectNode(node || (store.current?.url === url ? store.current : { url }));
    return url;
  } catch (error) {
    fieldError('diyLink', 'linkError', error.message);
    if (focus) $('diyLink').focus();
    return null;
  }
}

function validateLimits(focus = false) {
  const maxEnabled = $('maxEnabled').checked, durationEnabled = $('durationEnabled').checked;
  const maxMiB = Number($('maxMiB').value), duration = Number($('duration').value);
  const maxValid = !maxEnabled || ($('maxMiB').value !== '' && Number.isFinite(maxMiB) && maxMiB > 0 && maxMiB <= LIMITS.maxMiB);
  const timeValid = !durationEnabled || ($('duration').value !== '' && Number.isInteger(duration) && duration > 0 && duration <= LIMITS.maxDurationSeconds);
  $('maxMiB').setAttribute('aria-invalid', String(!maxValid));
  $('duration').setAttribute('aria-invalid', String(!timeValid));
  const text = !maxValid ? '启用流量上限后需填写大于 0、最多 1,048,576 MiB 的有效数字；不需要时取消勾选。' :
    !timeValid ? '启用自动停止后需填写 1–86,400 秒的整数；不需要时取消勾选。' : '';
  $('limitError').textContent = text; $('limitError').hidden = !text;
  if (text) { if (focus) $(maxValid ? 'duration' : 'maxMiB').focus(); return null; }
  writeStorage('tk_limits_v3', { maxMiB, duration, maxEnabled, durationEnabled });
  return { maxBytes: maxEnabled ? maxMiB * 1048576 : 0, durationSeconds: durationEnabled ? duration : 0 };
}

function threads() {
  const number = clampThreads($('thread').value);
  $('thread').value = number; writeStorage('tk_thread', number);
  return number;
}

function controls() {
  const running = engine.running, detecting = queue.running;
  for (const id of ['diyLink', 'thread', 'thMinus', 'thPlus', 'maxEnabled', 'durationEnabled', 'cacheBust', 'btnPick']) $(id).disabled = running;
  $('maxMiB').disabled = running || !$('maxEnabled').checked;
  $('duration').disabled = running || !$('durationEnabled').checked;
  $('chooseReadable').disabled = running || detecting;
  $('chooseReadable').textContent = store.current.url === store.recommended()?.url ? '检测或选择其他节点' : '切换推荐节点';
  $('startBtn').disabled = !running && detecting;
  $('startBtn').textContent = running ? '停止测试' : detecting ? '节点检测进行中…' : '开始测试';
  $('startBtn').classList.toggle('btn-danger', running);
  $('startBtn').classList.toggle('btn-primary', !running);
  $('runBadge').textContent = running ? '运行中' : '未运行';
  $('runBadge').classList.toggle('active', running);
  $('exportStats').disabled = running || !runInfo;
  $('btnDetect').disabled = running || detecting;
  $('btnDetectView').disabled = running || detecting;
  $('btnDetectStop').disabled = !detecting;
  $('btnSortSpeed').disabled = detecting || (!results.size && !sortedResults);
  $('btnSortSpeed').textContent = sortedResults ? '恢复分组' : '按速度排序';
  $('btnSortSpeed').setAttribute('aria-pressed', String(sortedResults));
  for (const button of $('modalBody').querySelectorAll('button[data-action]')) {
    button.disabled = button.dataset.action === 'probe' ? running || detecting : button.dataset.action === 'select' ? running : false;
  }
}

function displayStats(snapshot = engine.snapshot(false)) {
  $('vTotal').textContent = formatBytes(snapshot.bytes);
  $('vSpeed').textContent = formatSpeed(snapshot.speed);
  $('vMbps').textContent = (snapshot.speed * 8 / 1000000).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + ' Mbps';
  $('vAvg').textContent = formatSpeed(snapshot.average);
  $('elapsed').textContent = '已运行 ' + Math.floor(snapshot.elapsed).toLocaleString('zh-CN') + ' 秒';
  chart.setSpeed(snapshot.speed, false);
  chart.setLatency(snapshot.firstByteMs, false);
  if (document.visibilityState === 'visible' && !$('screenOff').open) chart.draw();
  document.title = snapshot.running ? formatBytes(snapshot.bytes) + ' · ' + formatSpeed(snapshot.speed) + ' · 流量消耗器' : title;
}

function engineState(event) {
  controls(); displayStats(event);
  if (event.state === 'connecting') { $('downloadRecovery').hidden = true; status('连接中，收到首个数据块后再扩展并发…'); }
  else if (event.state === 'connected') status('下载中 · 首块响应 ' + event.firstByteMs + ' ms · ' + event.threads + ' 并发', 'ok');
  else if (event.state === 'retrying') status('连接暂时失败，正在退避重试；可随时停止。');
  else if (event.state === 'stopped') {
    keep.stop();
    const message = event.reason === 'limit' ? '已达到流量上限，自动停止。' :
      event.reason === 'duration' ? '已达到时长上限，自动停止。' :
      event.reason === 'error' ? event.error : event.reason === 'offline' ? '网络已离线，测试停止；联网后可手动重新开始。' :
      event.reason === 'pagehide' ? '页面已离开，测试停止。' : '已停止测试；所有下载连接正在取消。';
    status(message, event.reason === 'error' || event.reason === 'offline' ? 'bad' : '');
    $('downloadRecovery').hidden = event.reason !== 'error';
  }
}

$('testForm').addEventListener('submit', event => {
  event.preventDefault();
  if (engine.running) { engine.stop(); return; }
  if (queue.running) { status('请先停止节点检测，再开始测试。'); return; }
  const url = validateLink(true);
  if (!url) return;
  const limits = validateLimits(true);
  if (!limits) return;
  if (limits.maxBytes === 0 && limits.durationSeconds === 0 &&
      !window.confirm('流量和时长均未限制，测试会持续下载，可能产生高额流量费用。\n确定开始吗？')) return;
  const count = threads();
  chart.clear(); lastHeartbeat = 0;
  runInfo = { startedAt: new Date().toISOString(), name: store.current.name, host: new URL(url).host,
    threads: count, ...limits, cacheBust: $('cacheBust').checked };
  engine.start({ url, threads: count, ...limits, cacheBust: $('cacheBust').checked });
  if (engine.running && $('keepAlive').checked) keep.start();
});
$('diyLink').addEventListener('input', () => fieldError('diyLink', 'linkError'));
$('diyLink').addEventListener('blur', event => {
  // 在鼠标按下“开始”时插入错误会移动按钮，导致抬起时无法提交。由 submit 统一校验并聚焦。
  if (!engine.running && event.relatedTarget !== $('startBtn')) validateLink();
});
$('thread').addEventListener('change', threads);
$('thMinus').addEventListener('click', () => { $('thread').value = clampThreads($('thread').value) - 1; threads(); });
$('thPlus').addEventListener('click', () => { $('thread').value = clampThreads($('thread').value) + 1; threads(); });
for (const id of ['maxMiB', 'duration']) {
  $(id).addEventListener('blur', event => { if (event.relatedTarget !== $('startBtn')) validateLimits(); });
  $(id).addEventListener('input', () => { $(id).setAttribute('aria-invalid', 'false'); $('limitError').hidden = true; });
}
for (const [toggle, input, suggested] of [['maxEnabled', 'maxMiB', 100], ['durationEnabled', 'duration', 60]]) {
  $(toggle).addEventListener('change', () => {
    if ($(toggle).checked && Number($(input).value) <= 0) $(input).value = suggested;
    controls(); validateLimits();
  });
}
$('keepAlive').addEventListener('change', () => {
  writeStorage('tk_keep', $('keepAlive').checked);
  if (engine.running && $('keepAlive').checked) keep.start(); else keep.stop();
});
$('cacheBust').addEventListener('change', () => writeStorage('tk_cache_bust', $('cacheBust').checked));

function notice(text, undo = false) {
  const node = $('configNotice'); node.replaceChildren(element('span', '', text));
  if (!store.persistent) node.append(element('span', 'r-warn', '浏览器无法保存配置，本次修改仅在当前页面有效。'));
  if (undo) {
    const button = element('button', 'btn btn-small', '撤销'); button.type = 'button';
    button.addEventListener('click', () => {
      store.undo(); renderConfig(); notice('已撤销上次操作。'); $('searchInput').focus();
    });
    node.append(button);
  }
}

function resultText(result) {
  if (!result) return '尚未检测';
  if (result.status === 'queued') return '等待检测…';
  if (result.status === 'ok' || result.status === 'small') {
    return `${result.status === 'small' ? '小文件' : '可读'} · ${formatSpeed(result.speed)} · ${formatBytes(result.bytes)} · 首块 ${result.firstByteMs ?? '—'} ms`;
  }
  return result.message || '未测得';
}

function paintResult(node, result) {
  node.textContent = resultText(result);
  node.className = 'node-result ' + (result?.status === 'ok' ? 'r-ok' : result?.status === 'error' ? 'r-bad' : result?.status === 'queued' ? 'r-run' : result ? 'r-warn' : '');
  node.title = result?.sampledAt ? '上次采样：' + new Date(result.sampledAt).toLocaleString('zh-CN') + '；' + result.message : '';
}

function paintUrl(url, result) { for (const node of rowResults.get(url) || []) paintResult(node, result); }

function nodeRow(item) {
  const row = element('div', 'node-row' + (item.url === store.current.url ? ' current' : ''));
  const main = element('div', 'node-main');
  main.append(element('div', 'node-name', item.name), element('div', 'node-url', item.url));
  const result = element('div', 'node-result'); paintResult(result, results.get(item.url));
  if (!rowResults.has(item.url)) rowResults.set(item.url, []);
  rowResults.get(item.url).push(result);
  const actions = element('div', 'node-actions');
  for (const [action, label] of [['select', '设为当前'], ['probe', '检测'], ['copy', '复制'], ['remove', item.custom ? '删除' : '隐藏']]) {
    const button = element('button', 'btn', label); button.type = 'button';
    button.dataset.action = action; button.dataset.url = item.url; button.dataset.name = item.name;
    button.dataset.custom = item.custom ? 'true' : 'false';
    button.setAttribute('aria-label', label + '：' + item.name);
    actions.append(button);
  }
  row.append(main, result, actions);
  return row;
}

function renderConfig() {
  const query = $('searchInput').value;
  const groups = store.groups(query), all = store.all(), unique = deduplicate(all);
  const shown = deduplicate(groups.flatMap(group => group.items));
  $('mSub').textContent = `${all.length} 条 · ${unique.length} 个唯一地址 · ${groups.length} 个匹配分组`;
  $('btnRestore').disabled = store.hidden.size === 0;
  rowResults.clear();
  const fragment = document.createDocumentFragment();
  if (sortedResults) {
    const ordered = rankProbeItems(shown, results);
    if (!ordered.length) fragment.append(element('p', 'empty', '没有匹配节点。试试缩短搜索词，或添加自定义 HTTPS 地址。'));
    else {
      const details = element('details', 'node-group');
      const summary = element('summary', '', '实测速度排序');
      summary.append(element('span', 'group-count', `${ordered.length} 条 · 完整采样优先，小文件与失败项置后`));
      const body = element('div', 'node-items');
      for (const item of ordered) body.append(nodeRow(item));
      details.append(summary, body); details.open = true;
      fragment.append(details);
    }
    $('modalBody').replaceChildren(fragment); controls(); return;
  }
  for (const [index, group] of groups.entries()) {
    const details = element('details', 'node-group');
    const summary = element('summary', '', group.name);
    summary.append(element('span', 'group-count', group.items.length + ' 条'));
    const body = element('div', 'node-items');
    let populated = false;
    const populate = () => {
      if (populated) return;
      populated = true;
      for (const item of group.items) body.append(nodeRow(item));
      controls();
    };
    details.append(summary, body);
    details.open = query.trim() ? true : (groupOpen.get(group.name) ?? index === 0);
    if (details.open) populate();
    details.addEventListener('toggle', () => {
      if (!details.isConnected) return;
      if (!query.trim()) groupOpen.set(group.name, details.open);
      if (details.open) populate();
    });
    fragment.append(details);
  }
  if (!groups.length) fragment.append(element('p', 'empty', '没有匹配节点。试试缩短搜索词，或添加自定义 HTTPS 地址。'));
  $('modalBody').replaceChildren(fragment); controls();
}

function openConfig() {
  renderConfig(); $('configDialog').showModal(); $('searchInput').focus();
}
for (const id of ['openConfig', 'btnPick']) $(id).addEventListener('click', openConfig);
$('chooseReadable').addEventListener('click', () => {
  if (engine.running || queue.running) return;
  const recommended = store.recommended();
  if (!recommended || store.current.url === recommended.url) { $('searchInput').value = ''; openConfig(); return; }
  selectNode(recommended); $('downloadRecovery').hidden = true;
  status('已切换推荐节点；不会自动下载，可先检测可读性，再点击开始。');
});
$('closeConfig').addEventListener('click', () => $('configDialog').close());
$('configDialog').addEventListener('close', () => {
  if (queue.running) { queue.stop(); saveResults(); }
  $('addForm').hidden = true; controls();
});
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderConfig, 120); });
$('modalBody').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const item = { name: button.dataset.name, url: button.dataset.url, custom: button.dataset.custom === 'true' };
  switch (button.dataset.action) {
    case 'select':
      if (engine.running) return;
      selectNode(item); $('configDialog').close(); status('已选择节点，可以开始测试。'); break;
    case 'probe': await runProbe([item]); break;
    case 'copy': await showCopy(item.url); break;
    case 'remove':
      store.remove(item.url, item.custom); renderConfig();
      notice(item.custom ? '已删除自定义节点。' : '已隐藏该地址的所有重复项；不会更改当前测试地址。', true);
      $('searchInput').focus(); break;
  }
});
$('btnRestore').addEventListener('click', () => {
  store.restore(); renderConfig(); notice('已恢复所有隐藏节点。', true);
});
$('btnAdd').addEventListener('click', () => {
  $('addForm').hidden = false; $('addName').focus();
});
$('btnAddCancel').addEventListener('click', () => { $('addForm').hidden = true; $('btnAdd').focus(); });
$('addForm').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const url = normalizeUrl($('addUrl').value);
    const item = store.add({ name: $('addName').value, url });
    fieldError('addUrl', 'addError'); $('addForm').reset(); $('addForm').hidden = true;
    $('searchInput').value = ''; groupOpen.set('自定义链接', true); renderConfig();
    notice('已添加“' + item.name + '”，配置仅存于当前浏览器。'); $('searchInput').focus();
  } catch (error) { fieldError('addUrl', 'addError', error.message); $('addUrl').focus(); }
});
$('addUrl').addEventListener('input', () => fieldError('addUrl', 'addError'));

function saveResults() { writeStorage('tk_detect_v3', Object.fromEntries(results)); }

async function runProbe(list, { batch = false } = {}) {
  if (engine.running || queue.running) return;
  const unique = deduplicate(list);
  if (!unique.length) { notice('没有可检测的节点，请添加节点或调整搜索。'); return; }
  const budget = formatBytes(unique.length * LIMITS.probeMaxBytes);
  const automatic = batch;
  if (!window.confirm(`即将检测 ${unique.length} 个唯一地址。\n每条最多 8 MiB / 8 秒，4 并发；理论响应体预算 ${budget}。\n在途数据和协议开销可能使实际流量略高。仅测试你有权使用的资源。` +
      (automatic ? '\n全部完成后将按实测速度排列，并自动选择最快的可读地址；不会自动开始下载。' : '') +
      '\n确定开始吗？')) return;
  const sequence = ++probeSequence;
  let outcome = null;
  for (const item of unique) { results.delete(item.url); paintUrl(item.url, { status: 'queued' }); }
  try {
    outcome = await queue.run(unique, {
      onProgress: progress => {
        $('detectProgress').max = Math.max(1, progress.total); $('detectProgress').value = progress.completed;
        $('detectInfo').textContent = `${progress.running ? '检测中' : progress.cancelled ? '已停止' : '检测完成'} ${progress.completed} / ${progress.total} · 已读取 ${formatBytes(progress.bytes)} · 理论预算 ${budget}`;
        controls();
      },
      onResult: (item, result) => { results.set(item.url, result); paintUrl(item.url, result); }
    });
  } catch { if (sequence === probeSequence) notice('检测未完成，请停止后重新尝试。'); }
  finally {
    if (sequence === probeSequence) {
      const complete = outcome && !outcome.cancelled && outcome.completed === outcome.total;
      if (automatic && complete) {
        const fastest = fastestProbeItem(unique, results);
        sortedResults = true;
        if (fastest) {
          const result = results.get(fastest.url);
          selectNode(fastest);
          notice(`检测完成：已按实测速度排列，并自动选择“${fastest.name}”（${result.status === 'ok' ? '完整采样' : '小文件，速度仅供参考'} · ${formatSpeed(result.speed)}）作为测速地址。`);
          status('已自动选择检测中最快的节点；不会自动开始下载。');
        } else notice('检测完成：已按实测速度排列；没有可用的采样结果，未自动切换测速地址。');
        renderConfig();
      } else {
        if (automatic && outcome?.cancelled) notice('检测已停止或未完成，未自动切换测速地址。');
        if (sortedResults) renderConfig();
        else for (const item of unique) paintUrl(item.url, results.get(item.url));
      }
      saveResults(); controls();
    }
  }
}
$('btnDetect').addEventListener('click', () => runProbe(store.all(), { batch: true }));
$('btnDetectView').addEventListener('click', () => runProbe(store.all($('searchInput').value), { batch: true }));
$('btnDetectStop').addEventListener('click', () => { queue.stop(); saveResults(); controls(); });
$('btnSortSpeed').addEventListener('click', () => {
  sortedResults = !sortedResults;
  renderConfig();
  notice(sortedResults ? '已按实测速度排列；小文件与未完成采样置后。' : '已恢复按原分组显示。');
});

async function showCopy(text) {
  if (await copyText(text)) { notice('已复制到剪贴板。'); return; }
  $('copyContent').value = text; $('copyDialog').showModal(); $('copyContent').focus(); $('copyContent').select();
}
$('closeCopy').addEventListener('click', () => $('copyDialog').close());
$('btnCopyResult').addEventListener('click', () => {
  if (!results.size) { notice('暂无检测结果，请先运行一次检测。'); return; }
  const entries = deduplicate(store.all()).filter(item => results.has(item.url)).map(item => ({
    name: item.name, url: item.url, ...results.get(item.url)
  }));
  showCopy(JSON.stringify({ version: VERSION, results: entries }, null, 2));
});
$('exportStats').addEventListener('click', () => {
  if (!runInfo || engine.running) return;
  const { url: _url, ...stats } = engine.snapshot(false);
  const content = JSON.stringify({ version: VERSION, test: runInfo, stats, samples: chart.points,
    note: '仅统计响应体字节，不包含协议开销。完整下载 URL 默认不导出，以避免泄露签名参数。' }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = 'speedtext-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('screenBtn').addEventListener('click', () => {
  $('screenOff').classList.remove('quiet'); $('screenOff').showModal();
  clearTimeout(screenTimer); screenTimer = setTimeout(() => $('screenOff').classList.add('quiet'), 1800);
});
$('exitScreenOff').addEventListener('click', () => $('screenOff').close());
$('screenOff').addEventListener('dblclick', () => $('screenOff').close());
$('screenOff').addEventListener('close', () => { clearTimeout(screenTimer); chart.draw(); displayStats(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('screenOff').open) { chart.draw(); displayStats(); }
  if (document.visibilityState === 'visible') network.resume(); else network.pause('hidden');
});
window.addEventListener('offline', () => { engine.stop('offline'); queue.stop(); network.pause('offline'); });
window.addEventListener('online', () => { network.resume(true); if (!engine.running) status('网络已恢复；测试不会自动开始。'); });

function startTicker() {
  if (ticker !== null) return;
  ticker = setInterval(() => {
    const wasRunning = engine.running, snapshot = engine.tick();
    const visible = document.visibilityState === 'visible' && !$('screenOff').open;
    if (wasRunning) chart.push(snapshot.speed, snapshot.firstByteMs, Date.now(), visible);
    if (visible || wasRunning) displayStats(snapshot);
    if (snapshot.running && visible && performance.now() - lastHeartbeat >= 5000) {
      lastHeartbeat = performance.now(); network.heartbeat();
    }
  }, 1000);
}
window.addEventListener('pagehide', () => {
  engine.stop('pagehide'); queue.stop(); keep.stop(); network.pause('pagehide');
  clearInterval(ticker); ticker = null;
});
window.addEventListener('pageshow', () => { startTicker(); network.resume(); });

// 3.0 的数值不代表用户显式开启；只有新版保存的开关才恢复启用状态。
const limits = readStorage('tk_limits_v3', null);
const explicitLimits = limits && typeof limits.maxEnabled === 'boolean' && typeof limits.durationEnabled === 'boolean';
const maxValid = explicitLimits && Number.isFinite(limits.maxMiB) && limits.maxMiB >= 0 && limits.maxMiB <= LIMITS.maxMiB;
const durationValid = explicitLimits && Number.isInteger(limits.duration) && limits.duration >= 0 && limits.duration <= LIMITS.maxDurationSeconds;
$('maxMiB').value = maxValid ? limits.maxMiB : LIMITS.defaultMaxBytes / 1048576;
$('duration').value = durationValid ? limits.duration : LIMITS.defaultDurationSeconds;
$('maxEnabled').checked = maxValid && limits.maxEnabled === true && limits.maxMiB > 0;
$('durationEnabled').checked = durationValid && limits.durationEnabled === true && limits.duration > 0;
$('thread').value = clampThreads(readStorage('tk_thread', LIMITS.defaultThreads));
$('keepAlive').checked = readStorage('tk_keep', false) === true;
$('cacheBust').checked = readStorage('tk_cache_bust', false) === true;
const savedResults = readStorage('tk_detect_v3', null);
if (savedResults && typeof savedResults === 'object' && !Array.isArray(savedResults)) {
  const known = new Set(store.all().map(item => item.url));
  for (const [url, value] of Object.entries(savedResults).slice(0, 400)) {
    const result = sanitizeProbeResult(value);
    if (known.has(url) && result) results.set(url, result);
  }
}
selectNode(store.current);
$('brandVer').textContent = 'v' + VERSION;
controls(); status(navigator.onLine ? '就绪。点击开始前，请确认节点和流量限制。' : '当前离线，请联网后再开始测试。');
startTicker(); network.start();

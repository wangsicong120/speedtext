import { LIMITS } from '../../shared/limits.js';
import { element, formatSpeed } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const finite = value => Number.isFinite(value) && value >= 0 ? value : 0;
export const GAUGE_SCALE = [0, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

// The reference dial has equally spaced marks, not a linear 0–5 Gbps scale.
export function gaugeProgress(mbps) {
  const value = finite(mbps);
  for (let index = 1; index < GAUGE_SCALE.length; index++) {
    if (value <= GAUGE_SCALE[index]) {
      const fraction = (value - GAUGE_SCALE[index - 1]) / (GAUGE_SCALE[index] - GAUGE_SCALE[index - 1]);
      return (index - 1 + fraction) / (GAUGE_SCALE.length - 1);
    }
  }
  return 1;
}

export class RateChart {
  constructor(root) {
    this.root = root;
    this.points = [];
    this.speed = 0;
    this.latency = null;
    this.nodeName = '';
    this.info = null;
    this.value = root.querySelector('#gaugeValue');
    this.arc = root.querySelector('#gaugeArc');
    this.latencyNode = root.querySelector('#gaugeLatency');
    this.details = document.getElementById('chartDetails');
    this.details?.addEventListener('toggle', () => { if (this.details.open) this.renderTable(); });
    this.renderScale();
    this.draw();
  }

  clear() { this.points = []; this.speed = 0; this.draw(); }

  setNode(name) {
    this.nodeName = name;
    const node = this.root.querySelector('#gaugeNode');
    node.textContent = name; node.title = name;
    this.drawGauge();
  }

  setSpeed(speed, draw = true) {
    this.speed = finite(speed);
    if (draw) this.drawGauge();
  }

  setLatency(latency, draw = true) {
    this.latency = Number.isFinite(latency) && latency >= 0 ? latency : null;
    if (draw) this.drawGauge();
  }

  setNetworkInfo(info) {
    this.info = info;
    const location = this.root.querySelector('#gaugeLocation');
    const provider = this.root.querySelector('#gaugeProvider');
    const source = this.root.querySelector('#gaugeSource');
    location.textContent = info?.location || '暂未测得出口信息'; location.title = location.textContent;
    provider.textContent = info?.organization || ''; provider.title = provider.textContent;
    source.textContent = info?.source || '';
    provider.hidden = !provider.textContent; source.hidden = !source.textContent;
    this.root.querySelector('#gaugeNetwork').title = [info?.ip, info?.location, info?.organization, info?.source].filter(Boolean).join(' · ');
    this.drawGauge();
  }

  push(speed, latency, at = Date.now(), draw = true) {
    const point = { at, speed: finite(speed), latency: Number.isFinite(latency) && latency >= 0 ? latency : null };
    this.points.push(point);
    this.speed = point.speed; this.latency = point.latency;
    if (this.points.length > LIMITS.chartPoints) this.points.shift();
    if (draw) this.draw();
  }

  renderScale() {
    const ticks = this.root.querySelector('#gaugeTicks');
    ticks.replaceChildren();
    for (const [index, value] of GAUGE_SCALE.entries()) {
      const angle = 135 + index * 270 / (GAUGE_SCALE.length - 1);
      const radians = angle * Math.PI / 180;
      const x = radius => 210 + Math.cos(radians) * radius;
      const y = radius => 191 + Math.sin(radians) * radius;
      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('class', 'gauge-tick');
      tick.setAttribute('x1', x(149).toFixed(3)); tick.setAttribute('y1', y(149).toFixed(3));
      tick.setAttribute('x2', x(137).toFixed(3)); tick.setAttribute('y2', y(137).toFixed(3));
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'gauge-tick-label');
      label.setAttribute('x', x(121).toFixed(3)); label.setAttribute('y', y(121).toFixed(3));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('transform', `rotate(${angle - 270} ${x(121).toFixed(3)} ${y(121).toFixed(3)})`);
      label.textContent = value >= 1000 ? value / 1000 + 'G' : String(value);
      ticks.append(tick, label);
    }
  }

  drawGauge() {
    const mbps = this.speed / 125000;
    const value = mbps.toFixed(1);
    this.value.textContent = value;
    this.value.setAttribute('font-size', String(Math.min(100, 340 / value.length)));
    this.arc.setAttribute('stroke-dashoffset', (100 - gaugeProgress(mbps) * 100).toFixed(3));
    this.arc.setAttribute('visibility', this.speed > 0 ? 'visible' : 'hidden');
    this.latencyNode.textContent = this.latency === null ? '— ms' : Math.round(this.latency) + 'ms';
    this.latencyNode.classList.toggle('is-unavailable', this.latency === null);
    this.root.setAttribute('aria-label', `实时下载带宽 ${value} Mbps，节点 ${this.nodeName || '加载中'}，本站 HTTP 首响应 ${this.latency === null ? '未测得' : Math.round(this.latency) + ' 毫秒'}。${this.info ? [this.info.location, this.info.organization, this.info.source].filter(Boolean).join('，') + '。' : ''}${this.points.length ? `本次已记录 ${this.points.length} 个采样点。` : '开始测试后更新。'}`);
  }

  draw() {
    this.drawGauge();
    if (this.details?.open) this.renderTable();
  }

  renderTable() {
    const body = document.getElementById('chartTable');
    if (!body) return;
    body.replaceChildren();
    for (const point of this.points) {
      const row = element('tr');
      row.append(element('td', '', new Date(point.at).toLocaleTimeString('zh-CN', { hour12: false })),
        element('td', '', formatSpeed(point.speed)), element('td', '', point.latency === null ? '—' : point.latency + ' ms'));
      body.append(row);
    }
  }
}

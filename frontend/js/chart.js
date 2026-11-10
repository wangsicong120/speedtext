import { LIMITS } from '../../shared/limits.js';
import { element, formatSpeed } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const finite = value => Number.isFinite(value) && value >= 0 ? value : 0;

export class RateChart {
  constructor(root) {
    this.root = root;
    this.points = [];
    this.details = document.getElementById('chartDetails');
    this.details?.addEventListener('toggle', () => { if (this.details.open) this.renderTable(); });
    this.draw();
  }

  clear() { this.points = []; this.draw(); }

  push(speed, latency, at = Date.now(), draw = true) {
    this.points.push({ at, speed: finite(speed), latency: Number.isFinite(latency) && latency >= 0 ? latency : null });
    if (this.points.length > LIMITS.chartPoints) this.points.shift();
    if (draw) this.draw();
  }

  draw() {
    const data = this.points;
    const maxRate = Math.max(1, ...data.map(point => point.speed / 1048576)) * 1.1;
    const maxLatency = Math.max(100, ...data.map(point => point.latency ?? 0)) * 1.1;
    const x = index => 46 + index * 628 / (LIMITS.chartPoints - 1);
    const y = (value, max) => 220 - value / max * 200;
    const rate = data.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.speed / 1048576, maxRate).toFixed(1)}`).join(' ');
    let segment = false;
    const latency = data.map((point, index) => {
      if (point.latency === null) { segment = false; return ''; }
      const command = segment ? 'L' : 'M'; segment = true;
      return `${command}${x(index).toFixed(1)},${y(point.latency, maxLatency).toFixed(1)}`;
    }).join(' ');
    this.root.querySelector('#ratePath').setAttribute('d', rate);
    this.root.querySelector('#rateArea').setAttribute('d', rate ? `${rate} L${x(data.length - 1).toFixed(1)},220 L46,220 Z` : '');
    this.root.querySelector('#latencyPath').setAttribute('d', latency);
    const labels = this.root.querySelector('#chartLabels');
    labels.replaceChildren();
    for (let index = 0; index <= 4; index++) {
      for (const [left, max] of [[true, maxRate], [false, maxLatency]]) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', left ? '39' : '681');
        text.setAttribute('y', String(224 - index * 50));
        text.setAttribute('text-anchor', left ? 'end' : 'start');
        text.textContent = left ? (max * index / 4).toFixed(1) : String(Math.round(max * index / 4));
        labels.append(text);
      }
    }
    const time = value => new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
    this.root.querySelector('#chartStart').textContent = data.length ? time(data[0].at) : '';
    this.root.querySelector('#chartEnd').textContent = data.length ? time(data.at(-1).at) : '';
    document.getElementById('chartEmpty').hidden = data.length > 0;
    const latest = data.at(-1);
    this.root.setAttribute('aria-label', latest ? `本次最近 ${data.length} 个采样点。最新下载速度 ${formatSpeed(latest.speed)}，本站首响应 ${latest.latency ?? '未测得'} 毫秒。可在下方查看数据表。` : '尚无下载数据，开始测试后显示趋势。');
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

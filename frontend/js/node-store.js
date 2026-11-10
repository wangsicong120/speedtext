import { DEFAULT_GROUPS, RECOMMENDED_DOWNLOAD_URL } from './nodes.js';
import { LIMITS } from '../../shared/limits.js';
import { deduplicate, normalizeUrl, readStorage, writeStorage } from './utils.js';

export function sanitizeNode(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  try {
    const url = normalizeUrl(item.url);
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, LIMITS.maxNameLength) : '';
    return { name: name || '自定义·' + new URL(url).host, url };
  } catch { return null; }
}

export class NodeStore {
  constructor({ read = readStorage, write = writeStorage, groups = DEFAULT_GROUPS } = {}) {
    this.write = write;
    this.persistent = true;
    this.defaults = groups.map(group => ({ name: group.name, items: group.items.map(sanitizeNode).filter(Boolean) }));
    const custom = read('tk_custom', []), hidden = read('tk_hidden', []);
    this.custom = Array.isArray(custom) ? deduplicate(custom.slice(0, LIMITS.maxCustomLinks).map(sanitizeNode).filter(Boolean)) : [];
    const known = new Set(this.defaults.flatMap(group => group.items.map(item => item.url)));
    this.hidden = new Set(Array.isArray(hidden) ? hidden.filter(url => typeof url === 'string' && known.has(url)) : []);
    this.current = sanitizeNode(read('tk_current', null)) || this.recommended();
    this.lastChange = null;
  }

  save(key, value) {
    if (this.write(key, value) === false) this.persistent = false;
  }

  groups(query = '') {
    const search = query.trim().toLocaleLowerCase('zh-CN');
    const groups = this.defaults.map(group => ({
      name: group.name, items: group.items.filter(item => !this.hidden.has(item.url))
    }));
    if (this.custom.length) groups.push({ name: '自定义链接', items: this.custom.map(item => ({ ...item, custom: true })) });
    return groups.map(group => ({
      ...group, items: group.items.filter(item => !search ||
        (group.name + ' ' + item.name + ' ' + item.url).toLocaleLowerCase('zh-CN').includes(search))
    })).filter(group => group.items.length);
  }

  all(query = '') { return this.groups(query).flatMap(group => group.items.map(item => ({ ...item, group: group.name }))); }

  recommended() {
    const available = this.all();
    return available.find(item => item.url === RECOMMENDED_DOWNLOAD_URL) || available[0] || this.defaults[0]?.items[0];
  }

  select(item) {
    const node = sanitizeNode(item);
    if (!node) throw new Error('节点地址无效，请重新填写 HTTPS 地址。');
    this.current = node; this.save('tk_current', node);
    return node;
  }

  add(item) {
    const node = sanitizeNode(item);
    if (!node) throw new Error('节点地址无效，请重新填写 HTTPS 地址。');
    if (this.custom.length >= LIMITS.maxCustomLinks) throw new Error('自定义节点已达 200 条，请先删除不需要的节点。');
    if (this.custom.some(it => it.url === node.url) || this.defaults.some(group => group.items.some(it => it.url === node.url))) {
      throw new Error('该地址已存在，可直接搜索选择；隐藏的节点请先恢复。');
    }
    this.custom.push(node); this.save('tk_custom', this.custom);
    return node;
  }

  remove(url, custom = false) {
    this.lastChange = { custom: [...this.custom], hidden: new Set(this.hidden) };
    if (custom) this.custom = this.custom.filter(item => item.url !== url);
    else this.hidden.add(url);
    this.save('tk_custom', this.custom); this.save('tk_hidden', [...this.hidden]);
  }

  undo() {
    if (!this.lastChange) return false;
    this.custom = this.lastChange.custom; this.hidden = this.lastChange.hidden; this.lastChange = null;
    this.save('tk_custom', this.custom); this.save('tk_hidden', [...this.hidden]);
    return true;
  }

  restore() {
    this.lastChange = { custom: [...this.custom], hidden: new Set(this.hidden) };
    this.hidden.clear(); this.save('tk_hidden', []);
  }
}

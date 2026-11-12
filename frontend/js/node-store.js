import { CUSTOM_DOWNLOAD_NODES, DEFAULT_NODES, NODE_CATALOG_REVISION,
  RECOMMENDED_DOWNLOAD_URL, REMOVED_DOWNLOAD_URLS } from './nodes.js';
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

const removedUrls = new Set(REMOVED_DOWNLOAD_URLS.map(normalizeUrl));
const companyNames = new Map(CUSTOM_DOWNLOAD_NODES.map(item => [normalizeUrl(item.url), item.name]));
function renameLegacyNode(node) {
  const name = node?.name.startsWith('自定义下载·') && companyNames.get(node.url);
  return name ? { ...node, name } : node;
}

export class NodeStore {
  constructor({ read = readStorage, write = writeStorage, nodes = DEFAULT_NODES } = {}) {
    this.write = write;
    this.persistent = true;
    this.defaults = nodes.map(sanitizeNode).filter(Boolean);
    const custom = read('tk_custom', []), hidden = read('tk_hidden', []);
    this.custom = Array.isArray(custom) ? deduplicate(custom.slice(0, LIMITS.maxCustomLinks).map(sanitizeNode).filter(Boolean)) : [];
    const known = new Set(this.defaults.map(item => item.url));
    this.hidden = new Set(Array.isArray(hidden) ? hidden.filter(url => typeof url === 'string' && known.has(url)) : []);
    const storedCurrent = sanitizeNode(read('tk_current', null));
    const migrate = read('tk_node_catalog', null) !== NODE_CATALOG_REVISION;
    this.selectionReset = Boolean(migrate && storedCurrent && removedUrls.has(storedCurrent.url));
    if (migrate) {
      const retained = this.custom.filter(item => !removedUrls.has(item.url)).map(renameLegacyNode);
      if (JSON.stringify(retained) !== JSON.stringify(this.custom)) this.save('tk_custom', retained);
      this.custom = retained;
      if (Array.isArray(hidden) && JSON.stringify([...this.hidden]) !== JSON.stringify(hidden)) this.save('tk_hidden', [...this.hidden]);
    }
    this.current = (this.selectionReset ? null : migrate ? renameLegacyNode(storedCurrent) : storedCurrent) || this.recommended();
    if (migrate) {
      if (this.selectionReset || (storedCurrent && this.current.name !== storedCurrent.name)) this.save('tk_current', this.current);
      if (this.persistent) this.save('tk_node_catalog', NODE_CATALOG_REVISION);
    }
    this.lastChange = null;
  }

  save(key, value) {
    if (this.write(key, value) === false) this.persistent = false;
  }

  all(query = '') {
    const search = query.trim().toLocaleLowerCase('zh-CN');
    const items = [...this.defaults.filter(item => !this.hidden.has(item.url)).map(item => ({ ...item })),
      ...this.custom.map(item => ({ ...item, custom: true }))];
    return items.filter(item => !search || (item.name + ' ' + item.url).toLocaleLowerCase('zh-CN').includes(search));
  }

  recommended() {
    const available = this.all();
    return available.find(item => item.url === RECOMMENDED_DOWNLOAD_URL) || available[0] || this.defaults[0];
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
    if (this.custom.some(it => it.url === node.url) || this.defaults.some(it => it.url === node.url)) {
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

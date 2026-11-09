// Read-only view of the live StickerKit. The kit owns its own live allow/deny rules.
export function createStickerGateway(getKit, { isEnabled = () => true } = {}) {
  async function kit() {
    const k = getKit();
    if (!k || typeof k.search !== 'function' || typeof k.all !== 'function') throw Error('表情插件未启用');
    return k;
  }
  const clean = s => ({ id: 'nekowhale:' + s.id, name: String(s.name || s.stem || '').slice(0,100), emotion: String(s.emotion || '').slice(0,40), tags: (s.tags || []).slice(0,10), description: String(s.use || '').slice(0,160), direction: String(s.dir || '').slice(0,80), source: 'nekowhale' });
  async function search(query = '', limit = 5) {
    if (!isEnabled()) return [];
    const k = await kit();
    const hits = await k.search(String(query).slice(0,80), { limit: Math.max(1, Math.min(20, Number(limit) || 5)), shuffle: false });
    return hits.map(hit => clean(hit.sticker));
  }
  async function resolve(id) {
    if (!isEnabled()) return null;
    if (typeof id !== 'string' || !id.startsWith('nekowhale:') || id.length > 240) return null;
    const k = await kit();
    // all() applies the live enabled list, blacklist, whitelist and selected packs.
    const found = (await k.all()).find(s => s.id === id.slice(10));
    if (!found) return null;
    const url = new URL(k.url(found));
    if (url.protocol !== 'https:' || url.hostname !== 'kiriyuki.com' || url.username || url.password) throw Error('不受信任的表情资源地址');
    if (!/^[a-f0-9]{12}$/i.test(String(found.hash || ''))) throw Error('表情缺少有效校验值');
    return { ...clean(found), url: url.href, hash: found.hash };
  }
  return { search, resolve };
}

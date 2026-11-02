// 短时缓存原始图片，供同一消息的识图与收藏复用；不保存失败结果。
export function createMediaFetchCache({ maxBytes = 8 * 1024 * 1024, ttlMs = 120000, now = Date.now } = {}) {
  const entries = new Map();
  const pending = new Map();
  let bytes = 0;
  function remove(key) { const old = entries.get(key); if (old) { bytes -= old.buffer.length; entries.delete(key); } }
  async function get(key, fetcher) {
    if (!key) return fetcher();
    const cached = entries.get(key);
    if (cached && cached.expires > now()) return { buffer: cached.buffer, mimeType: cached.mimeType };
    remove(key);
    if (pending.has(key)) return pending.get(key);
    const task = Promise.resolve().then(fetcher).then(result => {
      if (Buffer.isBuffer(result?.buffer) && result.buffer.length > 0 && result.buffer.length <= maxBytes) {
        for (const [k, v] of entries) if (v.expires <= now()) remove(k);
        while (bytes + result.buffer.length > maxBytes && entries.size) remove(entries.keys().next().value);
        entries.set(key, { buffer: result.buffer, mimeType: result.mimeType, expires: now() + ttlMs });
        bytes += result.buffer.length;
      }
      return result;
    });
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return { get };
}

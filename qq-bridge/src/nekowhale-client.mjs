import fs from 'node:fs';
import path from 'node:path';

export function createNekowhaleClient({ baseUrl, stateDir, config, request = fetch, getCookie = async origin => (await import('./dsh-client.js')).discoverDshSessionCookie(origin) }) {
  async function call(query) {
    let token = String(config()?.consoleToken || '').trim();
    if (!token) token = fs.readFileSync(path.join(stateDir, 'console-token'), 'utf8').trim();
    const origin = typeof baseUrl === 'function' ? baseUrl() : baseUrl;
    const url = new URL('/dsh-thinking-zh/qq-bigfish/sticker-source', origin);
    for (const [key,value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const cookie = await getCookie(origin);
    const res = await request(url, { headers: { 'x-console-token': token, ...(cookie ? {cookie} : {}) }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw Error(`表情服务不可用 (${res.status})`);
    const json = await res.json();
    if (!json.ok) throw Error('表情服务未准备好');
    return json;
  }
  return {
    search: async (query, count) => (await call({query, count})).stickers,
    resolve: async id => (await call({id})).sticker,
  };
}

import { generateSignature } from './xiaoheihe-signature.mjs';

// Only read operations are exposed; credentials never enter tool responses.
const ENDPOINTS = Object.freeze({ feed: '/bbs/app/feeds', post: '/bbs/app/link/tree' });
const MAX_BODY = 4 * 1024 * 1024;

export function createXiaoheiheClient({ getCredentials, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getCredentials !== 'function' || typeof fetchImpl !== 'function') throw new Error('小黑盒客户端配置不完整');
  async function request(type, args = {}) {
    const endpoint = ENDPOINTS[type];
    if (!endpoint) throw new Error('不支持的小黑盒操作');
    const credentials = await getCredentials();
    if (!credentials?.cookie || !/^\d{1,20}$/.test(String(credentials.heyboxId || '')) || !/^[0-9a-f]{32}$/.test(String(credentials.deviceId || ''))) throw new Error('请先登录小黑盒');
    let params;
    if (type === 'feed') {
      const offset = args.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('分页参数无效');
      params = { offset: String(offset), pull: '0', dw: '800' };
    } else {
      if (!/^\d{1,24}$/.test(String(args.postId || ''))) throw new Error('帖子编号无效');
      params = { link_id: String(args.postId), offset: '0', limit: '30' };
    }
    const sig = generateSignature(endpoint);
    const query = new URLSearchParams({ os_type: 'web', app: 'heybox', client_type: 'web', version: '999.0.4', web_version: '2.5', x_client_type: 'web', x_app: 'heybox_website', heybox_id: String(credentials.heyboxId), x_os_type: 'Windows', device_info: 'Chrome', device_id: credentials.deviceId, hkey: sig.hkey, _time: String(sig._time), nonce: sig.nonce, ...params });
    const response = await fetchImpl('https://api.xiaoheihe.cn' + endpoint + '?' + query, { headers: { Cookie: credentials.cookie, 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.xiaoheihe.cn/', Origin: 'https://www.xiaoheihe.cn' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('小黑盒请求失败：HTTP ' + response.status);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > MAX_BODY) throw new Error('小黑盒响应过大'); chunks.push(chunk); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('小黑盒响应格式无效'); }
    if (data?.status !== 'ok') throw new Error(['login', 'relogin'].includes(data?.status) ? '小黑盒登录已失效' : '小黑盒接口未成功');
    return data.result || {};
  }
  return { feed: (offset = 0) => request('feed', { offset }), post: (postId) => request('post', { postId }) };
}

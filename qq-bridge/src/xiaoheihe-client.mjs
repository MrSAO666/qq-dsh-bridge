import { generateSignature } from './xiaoheihe-signature.mjs';
import crypto from 'node:crypto';

// Only read operations are exposed; credentials never enter tool responses.
const ENDPOINTS = Object.freeze({ feed: '/bbs/app/feeds', post: '/bbs/app/link/tree', comment: '/bbs/app/comment/create' });
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
    } else if (type === 'post') {
      if (!/^\d{1,24}$/.test(String(args.postId || ''))) throw new Error('帖子编号无效');
      params = { link_id: String(args.postId), offset: '0', limit: '30' };
    } else {
      if (!/^\d{1,24}$/.test(String(args.postId || ''))) throw new Error('帖子编号无效');
      if (typeof args.text!=='string' || !args.text.trim() || args.text.length>500 || /[\u0000-\u0008]/.test(args.text)) throw new Error('评论内容无效');
      params = {};
    }
    const sig = generateSignature(endpoint);
    const common = { os_type: 'web', app: 'heybox', client_type: 'web', version: '999.0.4', web_version: '2.5', x_client_type: 'web', x_app: 'heybox_website', heybox_id: String(credentials.heyboxId), x_os_type: 'Windows', device_info: 'Chrome', device_id: credentials.deviceId, hkey: sig.hkey, _time: String(sig._time), nonce: sig.nonce, ...params };
    if (type === 'comment') {
      const signingKey='Z7mFG4tQp9Ws2LxB8H';
      Object.assign(common,{web_version:'3.0',x_client_version:'',_rnd:'15:'+crypto.createHmac('sha256',signingKey).update(`${signingKey}${sig.nonce}${sig._time}:${sig.nonce}`).digest('hex')});
      delete common.heybox_id; delete common.device_info; delete common.device_id;
    }
    const query = new URLSearchParams(common);
    const body=type==='comment'?new URLSearchParams({is_cy:'0',link_id:String(args.postId),reply_id:'0',root_id:'0',text:args.text.trim()}).toString():undefined;
    const response = await fetchImpl('https://api.xiaoheihe.cn' + endpoint + '?' + query, { method:type==='comment'?'POST':'GET',body,headers: { Cookie: credentials.cookie, 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.xiaoheihe.cn/', Origin: 'https://www.xiaoheihe.cn', ...(type==='comment'?{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8'}:{}) }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('小黑盒请求失败：HTTP ' + response.status);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > MAX_BODY) throw new Error('小黑盒响应过大'); chunks.push(chunk); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('小黑盒响应格式无效'); }
    if (data?.status !== 'ok') throw new Error(['login', 'relogin'].includes(data?.status) ? '小黑盒登录已失效' : '小黑盒接口未成功');
    if(type==='comment') return {commentId:String(data.commentid ?? data.result?.commentid ?? data.result?.comment?.[0]?.commentid ?? data.comment?.[0]?.commentid ?? '')};
    return data.result || {};
  }
  return { feed: (offset = 0) => request('feed', { offset }), post: (postId) => request('post', { postId }), comment:(postId,text)=>request('comment',{postId,text}) };
}

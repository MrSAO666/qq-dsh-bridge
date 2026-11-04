import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateSignature } from './xiaoheihe-signature.mjs';
import { QrLogin } from './xiaoheihe-login.mjs';
import { createXiaoheiheClient } from './xiaoheihe-client.mjs';

export function createXiaoheiheService({ directory, encode, fetchImpl = globalThis.fetch }) {
  if (!path.isAbsolute(directory)) throw new Error('小黑盒数据目录无效');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'account.json');
  let account;
  try { account = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('小黑盒账号文件无效'); }
  if (!account?.deviceId || !/^[0-9a-f]{32}$/.test(account.deviceId)) account = { deviceId: crypto.randomBytes(16).toString('hex') };
  function save(next) {
    const tmp = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, file); account = next; }
    finally { try { fs.unlinkSync(tmp); } catch {} }
  }
  async function loginRequest(endpoint, params, cookie) {
    if (!['/account/get_qrcode_url/', '/account/qr_state/', '/account/restore_login'].includes(endpoint)) throw new Error('非法登录请求');
    const sig = generateSignature(endpoint);
    const query = new URLSearchParams({ os_type:'web', app:'heybox', client_type:'web', version:'999.0.4', web_version:'2.5', x_client_type:'web', x_app:'heybox_website', heybox_id:'', x_os_type:'Windows', device_info:'Chrome', device_id:account.deviceId, hkey:sig.hkey, _time:String(sig._time), nonce:sig.nonce, ...params });
    const response = await fetchImpl('https://api.xiaoheihe.cn' + endpoint + '?' + query, { headers: { 'User-Agent':'Mozilla/5.0', Referer:'https://www.xiaoheihe.cn/', Origin:'https://www.xiaoheihe.cn', ...(cookie ? { Cookie: cookie } : {}) }, redirect:'error', signal:AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('小黑盒登录服务不可用');
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 128 * 1024) throw new Error('登录响应过大');
    let data; try { data = JSON.parse(raw); } catch { throw new Error('登录响应无效'); }
    return { data, cookies: response.headers.getSetCookie?.() || [] };
  }
  const login = new QrLogin({ request:loginRequest, encode, authenticate: async ({ cookie, heyboxId }) => save({ deviceId:account.deviceId, cookie, heyboxId, loggedInAt:Date.now() }) });
  const client = createXiaoheiheClient({ getCredentials: () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return account; }
  }, fetchImpl });
  return { login, client, status: () => ({ configured: !!(account.cookie && account.heyboxId), verified: false }), logout: () => { login.cancel(); save({ deviceId:account.deviceId }); } };
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Only manage the bridge's explicit cookie-export target; custom user cookies are untouched.
// Refresh at dispatch time, so re-login and credential removal cannot leave a stale export in use.
export function syncVideoCookies({ dataDir, home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh') }) {
  const target = path.join(home, 'bili-video-cookies.txt');
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(home, 'video.json'), 'utf8')); }
  catch { return false; }
  if (config.cookies !== target) return false;
  let cred;
  try {
    cred = JSON.parse(fs.readFileSync(path.join(dataDir, 'bili_credential.json'), 'utf8'));
    if (!['sessdata','bili_jct','dedeuserid'].every(k => typeof cred[k] === 'string' && cred[k] && !/[\r\n\t]/.test(cred[k]))) throw Error();
  } catch {
    fs.rmSync(target, { force: true });
    throw new Error('B站视频登录态不可用，请在B站设置页重新登录');
  }
  const rows = ['# Netscape HTTP Cookie File'];
  for (const [source, name] of [['sessdata','SESSDATA'],['bili_jct','bili_jct'],['dedeuserid','DedeUserID'],['buvid3','buvid3']]) {
    const value = cred[source];
    if (typeof value === 'string' && value && !/[\r\n\t]/.test(value)) rows.push(`.bilibili.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`);
  }
  const text = rows.join('\n') + '\n';
  if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text) { fs.chmodSync(target, 0o600); return true; }
  const temp = target + '.' + process.pid + '.tmp';
  try { fs.writeFileSync(temp, text, {mode: 0o600}); fs.renameSync(temp, target); }
  finally { fs.rmSync(temp, {force: true}); }
  return true;
}

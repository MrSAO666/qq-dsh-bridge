import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// A decision expires instead of silently becoming an unrelated later action.
export function createBrowseIntent(stateFile, now = Date.now) {
  const file = `${stateFile}.intent.json`;
  function read() {
    let value;
    try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    if (!value || value.version !== 1 || !Number.isFinite(value.expiresAt)) throw new Error('浏览意向状态无效');
    if (value.expiresAt <= now()) { clear(); return null; }
    return value;
  }
  function clear() { try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  function request() {
    if (read()) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify({version:1, expiresAt:now()+15*60*1000})+'\n', { mode:0o600, flag:'wx' }); fs.renameSync(tmp,file); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    return true;
  }
  return { read, clear, request };
}

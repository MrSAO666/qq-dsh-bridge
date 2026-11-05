// Independent, per-role self-authored personality notes. Never edits role cards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function createPersonaEvolutionStore(directory, options = {}) {
  const maxChars = options.maxChars ?? 1500;
  const maxHistory = options.maxHistory ?? 20;
  const cooldownMs = options.cooldownMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  function fileFor(role) {
    if (typeof role !== 'string' || !role.trim()) throw new Error('需要启用角色卡');
    return path.join(directory, crypto.createHash('sha256').update(role).digest('hex') + '.json');
  }
  function read(role) {
    const file = fileFor(role);
    if (!fs.existsSync(file)) return { content: '', updatedAt: 0, history: [], enabled: true };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof data.content !== 'string' || !Array.isArray(data.history) || !Number.isFinite(data.updatedAt)) throw new Error('自主设定数据格式错误');
    return data;
  }
  function save(role, content, { author = 'owner', force = false } = {}) {
    if (typeof content !== 'string') throw new Error('内容必须是文字');
    content = content.trim();
    if (content.length > maxChars) throw new Error(`自主设定最多 ${maxChars} 字`);
    const old = read(role);
    if (content === old.content) return old;
    const timestamp = now();
    if (author === 'agent' && old.enabled === false) throw new Error('自主设定已关闭');
    if (author === 'agent' && old.updatedAt && !force && timestamp - old.updatedAt < cooldownMs) throw new Error('修改过于频繁');
    const next = { ...old, content, updatedAt: timestamp, history: [{ content: old.content, updatedAt: old.updatedAt, replacedBy: author }, ...old.history].slice(0, maxHistory) };
    write(role, next);
    return next;
  }
  function write(role, next) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = fileFor(role);
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try { fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file); }
    finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function setEnabled(role, enabled) {
    const next = { ...read(role), enabled: enabled === true };
    write(role, next);
    return next;
  }
  function rollback(role, index) {
    const state = read(role);
    if (!Number.isInteger(index) || index < 0 || index >= state.history.length) throw new Error('历史版本不存在');
    return save(role, state.history[index].content, { author: 'owner' });
  }
  return { read, save, rollback, setEnabled, maxChars, cooldownMs };
}

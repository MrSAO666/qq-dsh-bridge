import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPersonaEvolutionStore } from '../src/persona-evolution.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-evolution-'));
try {
  let time = 100000000;
  const s = createPersonaEvolutionStore(dir, { now: () => time });
  assert.equal(s.read('A').content, '');
  s.save('A', '喜欢音乐', { author: 'agent' });
  assert.throws(() => s.save('A', '喜欢游戏', { author: 'agent' }), /频繁/);
  time += 86400000;
  s.save('A', '喜欢游戏', { author: 'agent' });
  assert.equal(s.read('B').content, '');
  assert.equal(s.rollback('A', 0).content, '喜欢音乐');
  assert.throws(() => s.save('A', 'x'.repeat(1501)), /最多/);
  s.setEnabled('A', false);
  time += 86400000;
  assert.throws(() => s.save('A', '喜欢电影', { author: 'agent' }), /关闭/);
  assert.equal(s.read('A').content, '喜欢音乐');
  s.save('A', '喜欢电影', { author: 'owner' });
  assert.equal(s.read('A').enabled, false);
  assert.throws(() => s.rollback('A', 999), /不存在/);
  assert.throws(() => s.read(''), /角色卡/);
  console.log('persona evolution store: OK');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

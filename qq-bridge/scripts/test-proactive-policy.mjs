import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chinaClock, inWindow, readBudget, reserveSend } from '../src/proactive-policy.mjs';

const now = Date.parse('2026-11-02T14:30:00Z'); // 北京 22:30
assert.equal(chinaClock(now).day, '2026-11-02');
assert.equal(inWindow('00:00', '00:00', now), true);
assert.equal(inWindow('22:00', '07:00', now), true);
assert.equal(inWindow('07:00', '22:00', now), false);
assert.equal(inWindow('invalid', '22:00', now), false);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-proactive-'));
try {
  const file = path.join(dir, 'quota.json');
  reserveSend(file, 'wake-1', 2, 2, now);
  reserveSend(file, 'wake-1', 2, 2, now);
  assert.throws(() => reserveSend(file, 'wake-1', 2, 2, now));
  reserveSend(file, 'wake-2', 2, 2, now);
  assert.equal(readBudget(file, now).count, 2);
  assert.throws(() => reserveSend(file, 'wake-3', 2, 2, now));
  assert.equal(readBudget(file, now + 86400000).count, 0);
  fs.writeFileSync(file, '{bad');
  assert.throws(() => readBudget(file, now));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('proactive policy tests passed');

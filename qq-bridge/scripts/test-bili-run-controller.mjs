import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBiliRunController } from '../src/bili-run-controller.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-controller-'));
const file = path.join(dir, 'state.json');
let time = Date.parse('2026-11-03T00:00:00Z');
let alarm, interrupts = [];
const deps = {
  stateFile: file, now: () => time,
  dispatch: async () => {}, interrupt: async x => { interrupts.push(x); },
  setTimer: (fn, delay) => { alarm = { fn, delay }; return 1; }, clearTimer: () => { alarm = null; },
};
try {
  let controller = createBiliRunController(deps);
  const id = await controller.start({ source: 'automatic' });
  assert.equal(alarm, undefined, '派发被接受时不能提前开始计时');
  time += 30000;
  controller.childStarted({ id, childId: 'child-1', startedAt: time });
  assert.equal(alarm.delay, 20 * 60000);
  assert.equal(controller.snapshot().counts['2026-11-03'], 1);
  controller.dispose();
  controller = createBiliRunController(deps);
  await assert.rejects(controller.start({ source: 'automatic' }), /已有刷站任务/);
  controller.restoreConfirmedRunning({ id: controller.snapshot().active.id, childId: 'child-1' });
  time += 20 * 60000;
  const fire = alarm.fn; alarm = null; fire();
  await Promise.resolve();
  assert.equal(interrupts.length, 1);
  assert.equal(controller.snapshot().active.status, 'stopping');
  await assert.rejects(controller.start({ source: 'owner' }), /已有刷站任务/);
  controller.confirmedFinished({ id });
  assert.equal(controller.snapshot().active, null);
  const manual = await controller.start({ source: 'owner' });
  controller.childStarted({ id: manual, childId: 'child-manual', startedAt: time });
  assert.equal(alarm, null, '主人任务没有自动截止');
  assert.equal(controller.snapshot().counts['2026-11-03'], 1);
  controller.confirmedFinished({ id: manual });
  controller.dispose();
  console.log('B 站任务控制器测试通过');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

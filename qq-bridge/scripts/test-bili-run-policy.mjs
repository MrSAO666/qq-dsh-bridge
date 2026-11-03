import assert from 'node:assert/strict';
import { DEFAULT_BILI_LIMITS, emptyBiliState, reserveBiliRun, markBiliChildStarted, requestBiliTimeout, finishBiliRun } from '../src/bili-run-policy.mjs';

const day1 = Date.parse('2026-11-03T15:59:00Z'); // 23:59 Beijing
const day2 = Date.parse('2026-11-03T16:01:00Z'); // 00:01 Beijing
let state = emptyBiliState();
for (let i = 0; i < 3; i++) {
  state = reserveBiliRun(state, { id: `a${i}`, source: 'automatic', now: day1 });
  if (i === 0) {
    const start = day1 + 30000;
    state = markBiliChildStarted(state, { id: 'a0', childId: 'child', now: start });
    assert.equal(state.active.deadlineAt, start + 20 * 60000, '从子任务实际开始计算');
    assert.throws(() => requestBiliTimeout(state, { id: 'a0', now: start + 20 * 60000 - 1 }));
    state = requestBiliTimeout(state, { id: 'a0', now: start + 20 * 60000 });
    assert.throws(() => finishBiliRun(state, { id: 'a0', confirmed: false }));
  }
  state = finishBiliRun(state, { id: `a${i}`, confirmed: true });
}
assert.throws(() => reserveBiliRun(state, { id: 'a3', source: 'automatic', now: day1 }));
state = reserveBiliRun(state, { id: 'manual', source: 'owner', now: day1 });
state = markBiliChildStarted(state, { id: 'manual', childId: 'manual-child', now: day1 });
assert.equal(state.active.deadlineAt, null, '主人任务不受自动时长限制');
assert.throws(() => reserveBiliRun(state, { id: 'collision', source: 'automatic', now: day2 }), /已有刷站任务/);
assert.throws(() => requestBiliTimeout(state, { id: 'manual', now: day2 }));
state = finishBiliRun(state, { id: 'manual', confirmed: true });
assert.equal(state.counts['2026-11-03'], 3, '主人任务不占自动次数');
state = reserveBiliRun(state, { id: 'next-day', source: 'automatic', now: day2 });
assert.equal(state.counts['2026-11-04'], 1, '按北京时间自然日计数');
assert.throws(() => reserveBiliRun(emptyBiliState(), { id: 'bad', source: 'automatic', limits: { ...DEFAULT_BILI_LIMITS, durationMinutes: 0 } }));
assert.throws(() => reserveBiliRun({ version: 1, counts: { '2026-11-03': -1 }, active: null }, { id: 'bad', source: 'owner' }));
console.log('B 站自动任务策略测试通过');

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyBiliState, reserveBiliRun, markBiliChildStarted, requestBiliTimeout, finishBiliRun } from './bili-run-policy.mjs';

// Single bridge process owns this file. The adapter is responsible for
// translating DSH child lifecycle events into started/completed callbacks.
export function createBiliRunController({ stateFile, dispatch, interrupt, onError = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!stateFile || typeof dispatch !== 'function' || typeof interrupt !== 'function') throw new Error('刷站控制器缺少依赖');
  let state;
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; state = emptyBiliState(); }
  let timer = null;

  function persist(next) {
    const dir = path.dirname(stateFile);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, `.${path.basename(stateFile)}.${process.pid}.${randomUUID()}.tmp`);
    try { fs.writeFileSync(tmp, JSON.stringify(next) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, stateFile); }
    catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
    state = next;
  }

  function clearAlarm() { if (timer !== null) clearTimer(timer); timer = null; }
  function arm() {
    clearAlarm();
    const a = state.active;
    if (!a || a.status !== 'running' || a.source !== 'automatic') return;
    timer = setTimer(() => {
      timer = null;
      // Persist stopping before sending interruption; keep the task occupied
      // until the adapter confirms termination, even when interruption fails.
      try { persist(requestBiliTimeout(state, { id: a.id, now: now() })); }
      catch (err) { if (now() < a.deadlineAt) { arm(); return; } onError(err); return; }
      Promise.resolve().then(() => interrupt({ id: a.id, childId: a.childId })).catch(onError);
    }, Math.max(0, a.deadlineAt - now()));
    timer?.unref?.();
  }

  async function start({ source, limits, context } = {}) {
    const id = randomUUID();
    persist(reserveBiliRun(state, { id, source, limits, now: now(), parentSessionId: context?.parentSessionId ?? null, reportTarget: context?.reportTarget ?? '' }));
    try {
      // No child ID or start is inferred from dispatch acceptance.
      await dispatch({ id, source, context });
      return id;
    } catch (err) {
      // Dispatch failure can be ambiguous (server may have accepted it).
      // Only a failure explicitly confirmed before dispatch may be cleared.
      if (err?.safeNoDispatch === true && state.active?.id === id && state.active.status === 'reserved') persist(finishBiliRun(state, { id, confirmed: true, now: now(), reason: 'dispatch_failed' }));
      throw err;
    }
  }
  function childStarted({ id, childId, startedAt }) {
    persist(markBiliChildStarted(state, { id, childId, now: startedAt }));
    arm();
  }
  function confirmedFinished({ id, reason }) {
    persist(finishBiliRun(state, { id, confirmed: true, now: now(), reason: reason || 'unknown' }));
    clearAlarm();
  }
  // Startup deliberately never clears an uncertain persisted task. Caller must
  // query DSH and confirm its status before declaring it finished or rearming.
  function restoreConfirmedRunning({ id, childId }) {
    const a = state.active;
    if (!a || a.id !== id || a.childId !== childId || a.status !== 'running') throw new Error('恢复任务信息不匹配');
    arm();
  }
  return { start, childStarted, confirmedFinished, restoreConfirmedRunning, snapshot: () => structuredClone(state), dispose: clearAlarm };
}

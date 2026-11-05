// Pure state transitions for a single bridge process. Persist the returned state
// before starting, interrupting, or acknowledging any external operation.
import { chinaClock } from './proactive-policy.mjs';

export const DEFAULT_BILI_LIMITS = Object.freeze({ dailyRuns: 3, durationMinutes: 20 });

function limitsOf(limits) {
  const { dailyRuns, durationMinutes } = limits;
  if (!Number.isInteger(dailyRuns) || dailyRuns < 0 || dailyRuns > 100) throw new Error('自动刷站每日次数无效');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw new Error('自动刷站时长无效');
  return { dailyRuns, durationMinutes };
}

export function emptyBiliState() {
  return { version: 1, counts: {}, active: null };
}

function checked(state) {
  if (!state || state.version !== 1 || !state.counts || typeof state.counts !== 'object' || Array.isArray(state.counts)) throw new Error('刷站状态无效');
  for (const [day, count] of Object.entries(state.counts)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(count) || count < 0) throw new Error('刷站计数无效');
  }
  if (state.active !== null) {
    const a = state.active;
    if (!a || typeof a.id !== 'string' || !a.id || !['automatic', 'owner'].includes(a.source) || !['reserved', 'running', 'stopping'].includes(a.status)) throw new Error('刷站任务状态无效');
    if (a.source === 'automatic' && (!Number.isInteger(a.durationMs) || a.durationMs <= 0)) throw new Error('刷站时长状态无效');
    if (a.source === 'owner' && a.durationMs !== null) throw new Error('主人任务时长状态无效');
    if (a.status !== 'reserved' && (!Number.isFinite(a.startedAt) || typeof a.childId !== 'string' || !a.childId)) throw new Error('刷站子任务信息无效');
    if (a.status !== 'reserved' && a.source === 'automatic' && a.deadlineAt !== a.startedAt + a.durationMs) throw new Error('刷站截止时间状态无效');
    if (a.status !== 'reserved' && a.source === 'owner' && a.deadlineAt !== null) throw new Error('主人任务截止时间状态无效');
  }
  return structuredClone(state);
}

// A reservation consumes an automatic slot before dispatch. A failed dispatch
// doesn't refund it, so retries/restarts can't bypass the cap.
export function reserveBiliRun(state, { id, source, limits = DEFAULT_BILI_LIMITS, now = Date.now(), parentSessionId = null, reportTarget = '' }) {
  const next = checked(state);
  const valid = limitsOf(limits);
  if (next.active) throw new Error('已有刷站任务或待确认的任务');
  if (typeof id !== 'string' || !id || !['automatic', 'owner'].includes(source) || !Number.isFinite(now)) throw new Error('刷站任务参数无效');
  if (parentSessionId !== null && (typeof parentSessionId !== 'string' || !parentSessionId)) throw new Error('刷站父会话无效');
  if (reportTarget && !/^private:\d+$/.test(reportTarget)) throw new Error('刷站汇报目标无效');
  const day = chinaClock(now).day;
  if (source === 'automatic') {
    const count = next.counts[day] || 0;
    if (count >= valid.dailyRuns) throw new Error('今日自动刷站次数已用完');
    next.counts[day] = count + 1;
    next.lastAutomaticAt = now;
  }
  next.active = { id, source, status: 'reserved', reservedAt: now, day, parentSessionId, reportTarget, durationMs: source === 'automatic' ? valid.durationMinutes * 60000 : null };
  return next;
}

// The caller must obtain actual child-start confirmation from DSH; dispatch
// acceptance or a parent turn starting is not sufficient.
export function markBiliChildStarted(state, { id, childId, now = Date.now() }) {
  const next = checked(state), active = next.active;
  if (!active || active.id !== id || active.status !== 'reserved' || typeof childId !== 'string' || !childId || !Number.isFinite(now)) throw new Error('无法确认刷站子任务开始');
  active.childId = childId;
  active.startedAt = now;
  active.deadlineAt = active.durationMs === null ? null : now + active.durationMs;
  active.status = 'running';
  if (active.source === 'automatic') {
    next.startedCounts ||= {};
    const day = chinaClock(now).day;
    next.startedCounts[day] = (next.startedCounts[day] || 0) + 1;
  }
  return next;
}

export function requestBiliTimeout(state, { id, now = Date.now() }) {
  const next = checked(state), active = next.active;
  if (!active || active.id !== id || active.status !== 'running' || active.source !== 'automatic' || !Number.isFinite(now) || now < active.deadlineAt) throw new Error('刷站任务尚未到时');
  active.status = 'stopping';
  return next;
}

// Clear only after a confirmed completion/cancellation, or if dispatch is known
// to have failed before creating a child. Uncertain states must stay blocked.
export function finishBiliRun(state, { id, confirmed, now = Date.now(), reason = 'completed' }) {
  const next = checked(state);
  if (!next.active || next.active.id !== id || confirmed !== true) throw new Error('刷站任务终止尚未确认');
  next.lastFinished = { at: now, reason, startedAt: next.active.startedAt ?? null, source: next.active.source };
  next.active = null;
  return next;
}

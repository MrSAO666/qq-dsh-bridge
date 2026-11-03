// Interpret the DSH session/follow stream for one explicitly addressed child.
// Snapshots contain historical events and must be deduplicated by sequence.
export function createBiliChildEventTracker({ onStart, onEnd }) {
  if (typeof onStart !== 'function' || typeof onEnd !== 'function') throw new Error('子任务事件回调无效');
  let started = false, ended = false, latestSeq = -1;
  function eventTime(event) {
    if (typeof event.time === 'number' && Number.isFinite(event.time)) return event.time;
    if (typeof event.time === 'string') { const value = Date.parse(event.time); if (Number.isFinite(value)) return value; }
    throw new Error('子任务事件缺少有效时间');
  }
  function apply(event) {
    if (!event || !Number.isSafeInteger(event.seq) || event.seq < 0 || event.seq <= latestSeq) return;
    latestSeq = event.seq;
    if (event.type === 'turn/start' && !started) { const at = eventTime(event); started = true; onStart(at); }
    if (event.type === 'turn/end' && started && !ended) { const at = eventTime(event); ended = true; onEnd(at); }
  }
  function receive(value) {
    if (!value || ended) return;
    if (value.type === 'snapshot') {
      if (!Array.isArray(value.records)) throw new Error('子任务快照无效');
      for (const record of value.records) apply(record?.event || record);
    } else if (value.type === 'event') apply(value.event);
  }
  return { receive, status: () => ({ started, ended, latestSeq }) };
}

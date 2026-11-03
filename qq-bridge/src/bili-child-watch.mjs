import { randomUUID } from 'node:crypto';
import { createBiliChildEventTracker } from './bili-child-events.mjs';

// The unique run label connects a parent's catalog event to exactly one child.
// Reconnect uses DSH snapshots, so start/end may have occurred while offline.
export function watchBiliChild({ api, parentSessionId, runId, onStart, onEnd, onError = () => {}, socketFactory = (url, opts) => new WebSocket(url, opts) }) {
  if (!api || !parentSessionId || !runId) throw new Error('刷站监听参数无效');
  const label = `bili-${runId}`;
  let socket, retry, stopped = false, childId = null, tracker, lastText = '', endReason = null;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let readySettled = false;
  const readyTimeout = setTimeout(() => settleReady(new Error('DSH 子任务事件流等待超时')), 15000);
  readyTimeout.unref?.();
  function settleReady(err) {
    if (readySettled) return;
    readySettled = true;
    clearTimeout(readyTimeout);
    if (err) readyReject(err); else readyResolve();
  }
  function stop() {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (socket && socket.readyState < 2) socket.close();
    settleReady(new Error('刷站监听已关闭'));
  }
  function schedule() {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = null; void connect(); }, 3000);
    retry.unref?.();
  }
  async function connect() {
    if (stopped) return;
    try {
      const cookie = await api.ensureAuth();
      if (stopped) return;
      const url = new URL('/api/remote.mux', api.baseUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = socketFactory(url, { headers: { cookie } });
      socket = ws;
      const parentStream = randomUUID(), childStream = randomUUID();
      let childOpened = false;
      function openChild(mode) {
        if (!childId || childOpened || ws.readyState !== 1) return;
        childOpened = true;
        ws.send(JSON.stringify({ type: 'open', streamId: childStream, endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'subagent', parentSessionId, childSessionId: childId, mode } } } } }));
      }
      ws.addEventListener('open', () => {
        if (stopped || socket !== ws) return;
        ws.send(JSON.stringify({ type: 'open', streamId: parentStream, endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId: parentSessionId } } } } }));
      });
      ws.addEventListener('message', ({ data }) => {
        if (stopped || socket !== ws) return;
        try {
          const frame = JSON.parse(data);
          if (frame.type !== 'item') return;
          const value = frame.value;
          const records = value?.type === 'snapshot' ? value.records : value?.type === 'event' ? [value.event] : [];
          if (!Array.isArray(records)) return;
          if (frame.streamId === parentStream) {
            // The first snapshot proves the listener is installed before dispatch.
            if (value?.type === 'snapshot') settleReady();
            for (const record of records) {
              const e = record?.event || record;
              if (e?.type !== 'subagent/catalog' || e.data?.label !== label || !e.data?.childId) continue;
              if (childId && childId !== e.data.childId) throw new Error('同一刷站任务出现多个子任务');
              childId = e.data.childId;
              if (!tracker) tracker = createBiliChildEventTracker({ onStart: at => onStart({ childId, startedAt: at }), onEnd: at => { onEnd({ childId, endedAt: at, text: endReason === 'completed' ? lastText : '', reason: endReason }); stop(); } });
              openChild(e.data.mode);
            }
          } else if (frame.streamId === childStream && tracker) {
            // Save complete assistant messages only; streamed reasoning is never sent.
            for (const record of records) {
              const e = record?.event || record;
              if (e?.type === 'assistant/message') {
                const content = e.data?.message?.content || [];
                const text = content.filter(x => x.type === 'text').map(x => x.text || '').join('').trim();
                if (text && !content.some(x => String(x.type).startsWith('tool'))) lastText = text.slice(0, 4000);
              }
              if (e?.type === 'turn/end') endReason = e.data?.reason?.kind || null;
              tracker.receive({ type: 'event', event: e });
            }
          }
        } catch (err) { onError(err); }
      });
      ws.addEventListener('error', () => { if (!readySettled) settleReady(new Error('无法连接 DSH 子任务事件流')); });
      ws.addEventListener('close', () => { if (!stopped && socket === ws) schedule(); });
    } catch (err) { if (!readySettled) settleReady(err); onError(err); schedule(); }
  }
  void connect();
  return { ready, stop, childId: () => childId };
}

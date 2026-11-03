// Keep delivery bookkeeping separate from the proactive-chat quota. Persist
// each returned state before sending anything over QQ.
function valid(s) {
  if (!s || s.version !== 1 || !Array.isArray(s.items)) throw new Error('B站推送队列无效');
  for (const x of s.items) {
    if (!x || typeof x.id !== 'string' || !x.id || typeof x.text !== 'string' || !x.text || !['pending', 'sending', 'sent', 'uncertain'].includes(x.status)) throw new Error('B站推送记录无效');
  }
  return structuredClone(s);
}
export function emptyBiliQueue() { return { version: 1, items: [] }; }
export function enqueueBiliReport(state, { id, text, target = '' }) {
  const next = valid(state);
  if (typeof id !== 'string' || !id || id.length > 200 || typeof text !== 'string' || !text.trim() || text.length > 12000) throw new Error('B站汇报无效');
  if (next.items.some(x => x.id === id)) return next;
  if (target && !/^private:\d+$/.test(target)) throw new Error('B站汇报接收人无效');
  next.items.push({ id, text: text.trim(), target, status: 'pending' });
  return next;
}
export function beginBiliDelivery(state, id) {
  const next = valid(state), item = next.items.find(x => x.id === id);
  if (!item || item.status !== 'pending') throw new Error('B站汇报不可发送');
  item.status = 'sending';
  return next;
}
export function resolveBiliDelivery(state, id, outcome) {
  const next = valid(state), item = next.items.find(x => x.id === id);
  if (!item || item.status !== 'sending' || !['sent', 'not_sent', 'uncertain'].includes(outcome)) throw new Error('B站汇报回执无效');
  item.status = outcome === 'not_sent' ? 'pending' : outcome;
  return next;
}
export function recoverBiliDelivery(state) {
  const next = valid(state);
  // A crash may occur after the remote accepted the message but before the
  // receipt was persisted. Never silently retry an ambiguous send.
  for (const item of next.items) if (item.status === 'sending') item.status = 'uncertain';
  return next;
}

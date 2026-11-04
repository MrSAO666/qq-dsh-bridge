import { chinaClock } from './proactive-policy.mjs';

// Callers must persist reservations before sending. An attempted action counts
// even when its acknowledgement is lost; failed/uncertain requests do not get
// retried automatically. UID text in raw content cannot bypass the allowlist.
export function reserveBiliInteraction(state, { kind, config, text = '', mentionUids = [], receiverUid = '', now = Date.now() }) {
  if (!state || state.version !== 1 || !state.counts || typeof state.counts !== 'object' || Array.isArray(state.counts)) throw new Error('互动记录无效');
  if (!['like', 'comment', 'dm'].includes(kind) || !config || !Number.isFinite(now)) throw new Error('互动参数无效');
  if (typeof text !== 'string' || text.length > 1000 || !Array.isArray(mentionUids)) throw new Error('评论参数无效');
  const opts = config.interactions;
  if (!opts || opts[`${kind}Enabled`] !== true) throw new Error('互动功能未启用');
  const limit = opts[`${kind}DailyLimit`];
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) throw new Error('互动额度无效');
  if (kind === 'like' && (text || mentionUids.length)) throw new Error('点赞不能携带评论');
  if (kind === 'comment') {
    if (!text.trim() || /[@＠]/u.test(text)) throw new Error('评论为空或包含未授权的 @ 文本');
    if (mentionUids.length > 3 || new Set(mentionUids).size !== mentionUids.length) throw new Error('@ 名单无效');
    if (mentionUids.length && opts.mentionEnabled !== true) throw new Error('@ 未启用');
    if (!Array.isArray(opts.mentionUids) || mentionUids.some(uid => typeof uid !== 'string' || !opts.mentionUids.includes(uid))) throw new Error('@ 对象不在名单内');
  }
  if (kind === 'dm' && (!text.trim() || !Array.isArray(opts.dmUids) || !opts.dmUids.includes(receiverUid))) throw new Error('私信内容或收件人无效');
  const next = structuredClone(state);
  const day = chinaClock(now).day;
  const count = next.counts[day] ?? { like: 0, comment: 0 };
  if (count.dm === undefined) count.dm = 0;
  if (!Number.isInteger(count.like) || count.like < 0 || !Number.isInteger(count.comment) || count.comment < 0) throw new Error('互动计数无效');
  if (!Number.isInteger(count.dm) || count.dm < 0) throw new Error('私信计数无效');
  if (count[kind] >= limit) throw new Error('今日互动额度已用完');
  count[kind]++;
  next.counts[day] = count;
  return next;
}

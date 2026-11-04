export const DEFAULT_BILI_CONFIG = Object.freeze({
  enabled: false,
  autoEnabled: false,
  dailyRuns: 3,
  durationMinutes: 20,
  sources: { keywords: ['AI资讯', '游戏资讯'], followUids: [], recommendations: false },
  interactions: { likeEnabled: false, likeDailyLimit: 3, commentEnabled: false, commentDailyLimit: 1, mentionEnabled: false, mentionUids: [], dmEnabled: false, dmDailyLimit: 3, dmUids: [], dmReadEnabled: false, dmReadUids: [] },
});

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}无效`);
  return value;
}
function bool(value, name) { if (typeof value !== 'boolean') throw new Error(`${name}必须为布尔值`); return value; }
function uidList(value, name) {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${name}无效`);
  return [...new Set(value.map(x => {
    const s = String(x);
    if (!/^[1-9]\d{0,15}$/.test(s) || !Number.isSafeInteger(Number(s))) throw new Error(`${name}包含无效 UID`);
    return s;
  }))];
}
export function normalizeBiliConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.sources || !raw.interactions) throw new Error('B站设置无效');
  const s = raw.sources, a = raw.interactions;
  if (!Array.isArray(s.keywords) || s.keywords.length > 50) throw new Error('关键词无效');
  const keywords = [...new Set(s.keywords.map(x => {
    if (typeof x !== 'string' || !x.trim() || x.trim().length > 80) throw new Error('关键词无效');
    return x.trim();
  }))];
  const mentionUids = uidList(a.mentionUids, '@名单');
  const mentionEnabled = bool(a.mentionEnabled, '@开关');
  if (mentionEnabled && !mentionUids.length) throw new Error('@名单为空时不能开启 @');
  const dmUids = uidList(a.dmUids ?? [], '私信名单');
  const dmEnabled = bool(a.dmEnabled ?? false, '私信开关');
  if (dmEnabled && !dmUids.length) throw new Error('私信名单为空时不能开启私信');
  const dmReadUids = uidList(a.dmReadUids ?? [], '私信读取名单');
  const dmReadEnabled = bool(a.dmReadEnabled ?? false, '私信读取开关');
  if (dmReadEnabled && !dmReadUids.length) throw new Error('私信读取名单为空时不能开启');
  return {
    enabled: bool(raw.enabled, 'B站功能开关'), autoEnabled: bool(raw.autoEnabled, '自动刷站开关'),
    dailyRuns: integer(raw.dailyRuns, '每日次数', 0, 100), durationMinutes: integer(raw.durationMinutes, '单次时长', 1, 1440),
    sources: { keywords, followUids: uidList(s.followUids, 'UP主名单'), recommendations: bool(s.recommendations, '推荐流开关') },
    interactions: { likeEnabled: bool(a.likeEnabled, '点赞开关'), likeDailyLimit: integer(a.likeDailyLimit, '点赞次数', 0, 100), commentEnabled: bool(a.commentEnabled, '评论开关'), commentDailyLimit: integer(a.commentDailyLimit, '评论次数', 0, 100), mentionEnabled, mentionUids, dmEnabled, dmUids, dmDailyLimit: integer(a.dmDailyLimit ?? 3, '私信次数', 0, 100), dmReadEnabled, dmReadUids },
  };
}

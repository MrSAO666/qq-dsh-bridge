export const DEFAULT_XIAOHEIHE_CONFIG=Object.freeze({enabled:false,autoEnabled:false,dailyRuns:3,durationMinutes:20,topics:['AI资讯','游戏资讯','新梗'],commentEnabled:false,dailyCommentLimit:3,commentCooldownSeconds:60});
export function normalizeXiaoheiheConfig(raw) {
 if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error('小黑盒设置无效');
 if (typeof raw.enabled!=='boolean'||typeof raw.autoEnabled!=='boolean') throw Error('小黑盒开关无效');
 if (!Number.isInteger(raw.dailyRuns)||raw.dailyRuns<0||raw.dailyRuns>100) throw Error('每日次数无效');
 if (!Number.isInteger(raw.durationMinutes)||raw.durationMinutes<1||raw.durationMinutes>1440) throw Error('单次时长无效');
 if (!Array.isArray(raw.topics)||raw.topics.length>30||raw.topics.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>80)) throw Error('关注话题无效');
 const commentEnabled=raw.commentEnabled ?? false, dailyCommentLimit=raw.dailyCommentLimit ?? 3, commentCooldownSeconds=raw.commentCooldownSeconds ?? 60;
 if(typeof commentEnabled!=='boolean') throw Error('评论开关无效');
 if(!Number.isInteger(dailyCommentLimit)||dailyCommentLimit<0||dailyCommentLimit>100) throw Error('评论每日上限无效');
 if(!Number.isInteger(commentCooldownSeconds)||commentCooldownSeconds<10||commentCooldownSeconds>86400) throw Error('评论冷却时间无效');
 return {enabled:raw.enabled,autoEnabled:raw.autoEnabled,dailyRuns:raw.dailyRuns,durationMinutes:raw.durationMinutes,topics:[...new Set(raw.topics.map(x=>x.trim()))],commentEnabled,dailyCommentLimit,commentCooldownSeconds};
}

import fs from 'node:fs';

const NAMES = Object.freeze({
  'mcp__bili-read__bili_search': '搜索视频',
  'mcp__bili-read__bili_user_videos': '查看 UP 主投稿',
  'mcp__bili-read__bili_read_video': '读取视频字幕',
});

// Read a bounded tail of the existing bridge tool audit, not chat contents or
// B站 credentials. Later scheduler events can extend this reader explicitly.
export function readBiliLogs(file, limit = 80, activityFile = null) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('日志条数无效');
  const activity = activityFile && fs.existsSync(activityFile) ? readActivity(activityFile, limit) : null;
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - 256 * 1024);
    const data = Buffer.alloc(size - start);
    const len = fs.readSync(fd, data, 0, data.length, start);
    let lines = data.subarray(0, len).toString('utf8').split('\n');
    if (start > 0) lines.shift();
    const entries = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (!Object.hasOwn(NAMES, row.tool) || !['call', 'result'].includes(row.type)) continue;
      if (typeof row.time !== 'string' || !Number.isFinite(Date.parse(row.time))) continue;
      entries.push({ time: row.time, action: NAMES[row.tool], state: row.type === 'call' ? '开始' : row.ok === true ? '完成' : '失败' });
    }
    const olderThan = activity?.entries.length ? Math.min(...activity.entries.map(x => Date.parse(x.time))) : Infinity;
    const combined = [...entries.filter(x => Date.parse(x.time) < olderThan), ...(activity?.entries || [])]
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    return { entries: combined.slice(0, limit), truncated: start > 0 || activity?.truncated === true };
  } catch (e) {
    if (e.code === 'ENOENT') return activity || { entries: [], truncated: false };
    throw e;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function readActivity(file, limit) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size, start = Math.max(0, size - 256 * 1024), data = Buffer.alloc(size - start);
    const len = fs.readSync(fd, data, 0, data.length, start);
    const lines = data.subarray(0, len).toString('utf8').split('\n'); if (start > 0) lines.shift();
    const validActions = new Set(['搜索视频', '查看 UP 主投稿', '读取视频字幕', '获取首页推荐', '读取评论', '点赞', '核实点赞', '评论', '回复', '私信']);
    const validStates = new Set(['开始', '完成', '失败', '无字幕', '无字幕跳过', '不确定']);
    const entries = [];
    const operations = new Map();
    for (const line of lines) {
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (!row || !validActions.has(row.action) || !validStates.has(row.state) || typeof row.time !== 'string' || !Number.isFinite(Date.parse(row.time))) continue;
      const item = { time: row.time, action: row.action, state: row.state };
      if (typeof row.reason === 'string') item.reason = row.reason.slice(0, 300);
      if (typeof row.bvid === 'string' && /^BV[0-9A-Za-z]{10}$/.test(row.bvid)) item.bvid = row.bvid;
      // Comments and reply targets are written only by the eventual authenticated
      // action adapter, and deliberately shown to the account owner.
      if (['评论', '回复'].includes(row.action)) {
        if (typeof row.content === 'string') item.content = row.content.slice(0, 1000);
        if (typeof row.replyTo === 'string') item.replyTo = row.replyTo.slice(0, 100);
        if (typeof row.stickerId === 'string' && row.stickerId.startsWith('nekowhale:')) item.stickerId = row.stickerId.slice(0, 240);
        if (Array.isArray(row.mentionUids)) item.mentionUids = row.mentionUids.filter(x => typeof x === 'string' && /^[1-9]\d{0,15}$/.test(x)).slice(0, 3);
      }
      if (row.action === '私信') {
        if (typeof row.content === 'string') item.content = row.content.slice(0, 1000);
        if (typeof row.receiverUid === 'string' && /^[1-9]\d{0,15}$/.test(row.receiverUid)) item.replyTo = 'UID ' + row.receiverUid;
      }
      const id = typeof row.operationId === 'string' ? row.operationId : null;
      const prior = id ? operations.get(id) : entries.at(-1);
      const sameLegacyOperation = !id && prior && !prior.id && prior.item.state === '开始'
        && ['完成', '失败', '不确定'].includes(item.state)
        && ['action', 'bvid', 'content', 'replyTo'].every(key => prior.item[key] === item[key])
        && Date.parse(item.time) >= Date.parse(prior.item.time)
        && Date.parse(item.time) - Date.parse(prior.item.time) <= 120000;
      if (prior && prior.item.state === '开始' && (id || sameLegacyOperation)) {
        prior.item = item;
        if (id) operations.delete(id);
      } else {
        const entry = { id, item };
        entries.push(entry);
        if (id && item.state === '开始') operations.set(id, entry);
      }
    }
    return { entries: entries.map(entry => entry.item).slice(-limit).reverse(), truncated: start > 0 };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

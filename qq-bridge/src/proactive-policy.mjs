import fs from 'node:fs';

export function chinaClock(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { day: `${v.year}-${v.month}-${v.day}`, minute: Number(v.hour) * 60 + Number(v.minute) };
}

export function inWindow(start, end, now = Date.now()) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return false;
  const parse = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const a = parse(start), b = parse(end), t = chinaClock(now).minute;
  return a === b || (a < b ? t >= a && t < b : t >= a || t < b);
}

export function readBudget(file, now = Date.now()) {
  const day = chinaClock(now).day;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof data.day !== 'string' || !Number.isInteger(data.count) || data.count < 0 || (data.wakes !== undefined && (typeof data.wakes !== 'object' || data.wakes === null))) throw new Error('主动消息额度数据损坏');
    return data.day === day ? { day, count: data.count, wakes: data.wakes || {} } : { day, count: 0, wakes: {} };
  } catch (e) {
    if (e.code === 'ENOENT') return { day, count: 0, wakes: {} };
    throw e;
  }
}

// 发送前预留：失败也计数，进程重启后不能绕过限制。
export function reserveSend(file, wakeId, maxDaily, maxPerWake, now = Date.now()) {
  const budget = readBudget(file, now);
  const used = budget.wakes[wakeId] || 0;
  if (!used && budget.count >= maxDaily) throw new Error('今日主动开口次数已用完');
  if (used >= maxPerWake) throw new Error('本次主动开口消息条数已用完');
  if (!used) budget.count++;
  budget.wakes[wakeId] = used + 1;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(budget) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

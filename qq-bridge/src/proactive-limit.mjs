import fs from 'node:fs';

export const beijingDay = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
export function readQuota(file, now = Date.now()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.day === beijingDay(now) && Number.isInteger(data.count) && data.count >= 0) return data.count;
    if (typeof data.day === 'string' && data.day !== beijingDay(now)) return 0;
    throw new Error('invalid quota data');
  } catch (e) {
    if (e.code === 'ENOENT') return 0;
    throw e;
  }
}
export function reserveQuota(file, max = 5, now = Date.now()) {
  const count = readQuota(file, now);
  if (count >= max) throw new Error('今日主动消息额度已用完');
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({day:beijingDay(now),count:count + 1}) + '\n', {mode:0o600});
  fs.renameSync(temp, file);
  return count + 1;
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBiliLogs } from '../src/bili-log.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-log-'));
try {
  const file = path.join(dir, 'events.jsonl');
  assert.deepEqual(readBiliLogs(file), { entries: [], truncated: false });
  const rows = [
    { type:'call', time:'2026-11-03T01:00:00Z', tool:'mcp__bili-read__bili_search', args:{token:'SECRET',keyword:'private'} },
    { type:'result', time:'2026-11-03T01:00:03Z', tool:'mcp__bili-read__bili_search', ok:true },
    { type:'call', time:'2026-11-03T01:00:03Z', tool:'mcp__snowluma__qq_send_message', args:{text:'private'} },
    { type:'result', time:'2026-11-03T01:00:05Z', tool:'mcp__bili-read__bili_read_video', ok:false, error:'SECRET' },
  ];
  fs.writeFileSync(file, rows.map(x => JSON.stringify(x)).join('\n'));
  const result = readBiliLogs(file, 2);
  assert.deepEqual(result.entries.map(x => x.state), ['失败','完成']);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|private/);
  const activity = path.join(dir, 'activity.jsonl');
  fs.writeFileSync(activity, [
    {time:'2026-11-03T01:00:10Z',action:'读取视频字幕',state:'完成',bvid:'BV1234567890'},
    {time:'2026-11-03T01:00:11Z',action:'回复',state:'完成',bvid:'BV1234567890',content:'很有意思',replyTo:'UP主'},
    {time:'2026-11-03T01:00:12Z',action:'读取视频字幕',state:'完成',bvid:'invalid'},
  ].map(x=>JSON.stringify(x)).join('\n'));
  const actual = readBiliLogs(file, 80, activity);
  assert.equal(actual.entries[1].bvid, 'BV1234567890');
  assert.equal(actual.entries[1].content, '很有意思');
  assert.equal(actual.entries[1].replyTo, 'UP主');
  assert.equal(actual.entries[0].bvid, undefined);
  fs.writeFileSync(activity, [
    {time:'2026-11-03T01:01:00Z',action:'回复',state:'开始',bvid:'BV1234567890',content:'你好',replyTo:'某位用户'},
    {time:'2026-11-03T01:01:01Z',action:'回复',state:'完成',bvid:'BV1234567890',content:'你好',replyTo:'某位用户'},
    {time:'2026-11-03T01:01:02Z',action:'回复',state:'开始',bvid:'BV1234567890',content:'你好',replyTo:'某位用户'},
    {time:'2026-11-03T01:01:03Z',action:'回复',state:'不确定',bvid:'BV1234567890',content:'你好',replyTo:'某位用户'},
    {time:'2026-11-03T01:01:04Z',operationId:'one',action:'点赞',state:'开始',bvid:'BV1234567890'},
    {time:'2026-11-03T01:01:05Z',action:'读取评论',state:'完成',bvid:'BV1234567890'},
    {time:'2026-11-03T01:01:06Z',operationId:'one',action:'点赞',state:'完成',bvid:'BV1234567890'},
    {time:'2026-11-03T01:01:07Z',operationId:'two',action:'点赞',state:'开始',bvid:'BV1234567890'},
  ].map(x=>JSON.stringify(x)).join('\n'));
  const merged = readBiliLogs(file, 80, activity).entries.filter(x => Date.parse(x.time) >= Date.parse('2026-11-03T01:01:00Z'));
  assert.equal(merged.length, 5);
  assert.deepEqual(merged.filter(x => x.action === '回复').map(x => x.state), ['不确定', '完成']);
  assert.deepEqual(merged.filter(x => x.action === '点赞').map(x => x.state), ['开始', '完成']);
  assert.throws(() => readBiliLogs(file, 0));
  console.log('B站日志读取与脱敏通过');
} finally { fs.rmSync(dir, {recursive:true,force:true}); }

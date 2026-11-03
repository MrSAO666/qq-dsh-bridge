import assert from 'node:assert/strict';
import path from 'node:path';
import { createBiliClient } from '../src/bili-client.mjs';

const names = ['bili_login', 'bili_login_check', 'bili_check_credential', 'bili_search', 'bili_user_videos', 'bili_subtitle', 'bili_video_info'];
let response = { message: '该视频没有字幕' }, closed = false;
const fake = {
  connect: async () => {}, listTools: async () => ({ tools: names.map(name => ({ name })) }),
  callTool: async () => ({ content: [{ type: 'text', text: JSON.stringify(response) }] }),
  close: async () => { closed = true; },
};
const client = createBiliClient({ python: 'python3', script: 'mcp_server.py', dataDir: path.resolve('bili-state'), clientFactory: () => fake, transportFactory: () => ({}) });
assert.deepEqual(await client.readSubtitledVideo('BV1234567890'), { bvid: 'BV1234567890', available: false });
response = { title: '标题', language: '中文', text: '示例字幕' };
assert.deepEqual(await client.readSubtitledVideo('BV1234567890', 2), { bvid: 'BV1234567890', available: true, title: '标题', language: '中文', text: '示例', offset:0,nextOffset:2,totalChars:4,truncated: true });
assert.equal((await client.readSubtitledVideo('BV1234567890', 2, 2)).text,'字幕');
await assert.rejects(client.readSubtitledVideo('invalid'), /视频参数/);
await assert.rejects(client.call('bili_reply', {}), /未授权/);
await client.close();
assert.equal(closed, true);
const extra = createBiliClient({ python: 'python3', script: 'mcp_server.py', dataDir: path.resolve('bili-state'), clientFactory: () => ({ ...fake, listTools: async () => ({ tools: [...names, 'bili_reply'].map(name => ({ name })) }) }), transportFactory: () => ({}) });
await assert.rejects(extra.call('bili_search', {}), /未授权工具/);
console.log('B站客户端测试通过');

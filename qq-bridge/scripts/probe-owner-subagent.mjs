import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { probeCookie, probeRpc, probeMuxSocket, probeWorkspaceDir } from './probe-auth.mjs';
const base = process.env.DSH_BASE_URL || 'http://127.0.0.1:3080';
const cookie = probeCookie({ base });
const rpc = probeRpc(cookie, { base });
const dir = probeWorkspaceDir('owner-subagent');
let wsId, sessionId, socket;
try {
  const presets = await rpc('agentPresets/list', {});
  if (!presets.ok) throw new Error('无法读取预设列表');
  const ws = await rpc('workspace/create', { request: { path: dir } });
  if (!ws.ok) throw new Error('无法创建临时工作区');
  wsId = ws.value.workspace.workspaceId;
  const session = await rpc('session/create', { request: { workspaceId: wsId, agentPreset: 'qq-chat-owner' } });
  if (!session.ok) throw new Error('主人预设会话创建失败: ' + JSON.stringify(session.error));
  sessionId = session.value.sessionId;
  console.log('主人预设会话创建成功');
  socket = probeMuxSocket(cookie, { base });
  const streamId = randomUUID();
  const seen = [];
  let subagentCallId, accepted = false, completion = false;
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 90000);
    const finish = (v) => { clearTimeout(timer); resolve(v); };
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'open', streamId, endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId } } } } }));
      setTimeout(async () => {
        const prompt = await rpc('session/prompt', { request: { sessionId, requestId: randomUUID(), mode: 'queue', content: [{ type: 'text', text: '这是独立的工作区会话。不要调用任何 QQ 发送工具，不访问外部服务。请调用 subagent 工具，安排一个子任务计算 17 加 25；子任务也不要访问外部服务或发送消息。最后仅在本会话报告子任务的结果。' }] } });
        if (!prompt.ok) finish('prompt-error: ' + JSON.stringify(prompt.error));
      }, 700);
    });
    socket.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type !== 'item' || m.streamId !== streamId || m.value?.type !== 'event') return;
      const e = m.value.event;
      if (e.type === 'tool/call') { const n = e.data?.name || ''; seen.push(n); if (n === 'subagent') subagentCallId = e.data?.callId; console.log('调用工具:', n); }
      if (e.type === 'tool/result' && subagentCallId && e.data?.message?.source?.callId === subagentCallId) {
        const msg = e.data.message;
        const block = msg.content?.[0];
        accepted = msg.isError !== true && block?.isError !== true;
        console.log('子 Agent 工具返回:', accepted ? '成功' : '失败');
        if (!accepted) finish('tool-error');
      }
      if (e.type === 'assistant/message') {
        const text = (e.data?.message?.content || []).filter(x => x?.type === 'text').map(x => x.text || '').join('');
        if (/42/.test(text)) { completion = true; finish('result-received'); }
      }
    });
    socket.addEventListener('error', () => finish('socket-error'));
  });
  console.log('结束状态:', result, '工具成功:', accepted, '收到计算结果:', completion);
  if (!accepted || !completion) process.exitCode = 1;
} finally {
  socket?.close();
  if (sessionId) await rpc('workspace/archiveSession', { request: { sessionId } }).catch(() => {});
  if (wsId) await rpc('workspace/delete', { request: { workspaceId: wsId } }).catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { probeCookie, probeRpc, probeMuxSocket, probeWorkspaceDir } from './probe-auth.mjs';
const base = process.env.DSH_BASE_URL || 'http://127.0.0.1:3080';
const cookie = probeCookie({base}), rpc = probeRpc(cookie, {base}), dir = probeWorkspaceDir('bili-owner');
let wsId, sessionId, socket;
try {
  const ws = await rpc('workspace/create', { request: { path: dir } });
  if (!ws.ok) throw Error('workspace failed'); wsId = ws.value.workspace.workspaceId;
  const s = await rpc('session/create', { request: { workspaceId: wsId, agentPreset: 'qq-chat-owner' } });
  if (!s.ok) throw Error('session failed'); sessionId = s.value.sessionId;
  socket = probeMuxSocket(cookie,{base}); const streamId = randomUUID(), names = [], pending = new Map(); let success = false;
  const outcome = await new Promise(resolve => {
    const timer = setTimeout(() => resolve('timeout'), 90000);
    const finish = v => {clearTimeout(timer); resolve(v)};
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type:'open', streamId, endpoint:'session/follow', payload:{ args:{ request:{ address:{kind:'session',sessionId} } } } }));
      setTimeout(async () => {
        const p = await rpc('session/prompt',{ request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'这是独立的工作区会话，不要调用任何 QQ 发送工具。请调用 mcp__bili-read__bili_search 搜索 AI，取 1 条结果，然后只在本会话说完成。'}]} });
        if(!p.ok) finish('prompt-error');
      },700);
    });
    socket.addEventListener('message', ev => {
      let m;try{m=JSON.parse(ev.data)}catch{return}; if(m.type!=='item'||m.streamId!==streamId||m.value?.type!=='event')return;
      const e=m.value.event;
      if(e.type==='tool/call'){names.push(e.data?.name);pending.set(e.data?.callId,e.data?.name)}
      if(e.type==='tool/result' && pending.get(e.data?.message?.source?.callId)==='mcp__bili-read__bili_search'){
        const msg=e.data.message; success=msg.isError!==true && msg.content?.[0]?.isError!==true;
      }
      if(e.type==='turn/end')finish('turn-end');
    });
    socket.addEventListener('error',()=>finish('socket-error'));
  });
  console.log('state:',outcome,'search called:',names.includes('mcp__bili-read__bili_search'),'tool success:',success);
  if(!success)process.exitCode=1;
} finally {
  socket?.close(); if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});
  if(wsId)await rpc('workspace/delete',{request:{workspaceId:wsId}}).catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
}

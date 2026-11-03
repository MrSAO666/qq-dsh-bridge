import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { probeCookie, probeRpc, probeMuxSocket, probeWorkspaceDir } from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080', cookie=probeCookie({base}),rpc=probeRpc(cookie,{base}), dir=probeWorkspaceDir('bili-lifecycle');
let wsId, sessionId, socket, childId;
try {
  const w=await rpc('workspace/create',{request:{path:dir}}); if(!w.ok)throw Error('workspace failed'); wsId=w.value.workspace.workspaceId;
  const s=await rpc('session/create',{request:{workspaceId:wsId,agentPreset:'qq-chat-owner'}}); if(!s.ok)throw Error('session failed'); sessionId=s.value.sessionId;
  socket=probeMuxSocket(cookie,{base}); const parentStream=randomUUID(), childStream=randomUUID(); let started=false, ended=false, interruptAccepted=false, interruptRequested=false;
  const result=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve('timeout'),90000);
    const finish=x=>{clearTimeout(timer);resolve(x)};
    socket.addEventListener('open',()=>{
      socket.send(JSON.stringify({type:'open',streamId:parentStream,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));
      setTimeout(async()=>{const p=await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'独立工作区中调用 subagent 工具创建一个子任务，要求子任务使用 bash 执行 sleep 30，然后计算 17 加 25；子任务描述使用 bililifecycle。不要使用 QQ 或网络，等待它完成后在本会话报告结果。'}]}});if(!p.ok)finish('prompt failed')},700);
    });
    socket.addEventListener('message',ev=>{
      let m;try{m=JSON.parse(ev.data)}catch{return}
      if(m.streamId===childStream) console.log('child frame:',m.type,'value type:',m.value?.type||'', 'error:',m.error?.code||'');
      if(m.streamId===childStream && m.value?.type==='snapshot') {
        const records=m.value.records || [];
        console.log('snapshot records:', Array.isArray(records) ? records.map(x=>x?.event?.type||x?.type||'?').join(',') : typeof records);
        console.log('snapshot keys:', Object.keys(m.value).sort().join(','));
        if (Array.isArray(records)) for(const record of records) {
          const event=record?.event||record;
          if(event?.type==='turn/start') {
            started=true; console.log('child start in snapshot, event keys:',Object.keys(event).sort().join(','));
            if (!interruptRequested) {
              interruptRequested=true;
              void rpc('subagents/interruptByParent',{childSessionId:childId,parentSessionId:sessionId,mode:'continuable'}).then(r=>{interruptAccepted=r.ok===true;console.log('interrupt accepted:',interruptAccepted)});
            }
          }
        }
      }
      if(m.type!=='item'||m.value?.type!=='event')return;
      const e=m.value.event;
      if(m.streamId===parentStream && e.type==='subagent/catalog') {
        console.log('catalog fields:',Object.keys(e.data||{}).sort().join(','));
        childId=e.data?.childId;
        if(childId)socket.send(JSON.stringify({type:'open',streamId:childStream,endpoint:'session/follow',payload:{args:{request:{address:{kind:'subagent',parentSessionId:sessionId,childSessionId:childId,mode:e.data.mode}}}}}));
      }
      if(m.streamId===childStream && e.type==='turn/start'){started=true;console.log('child turn/start observed')}
      if(m.streamId===childStream && e.type==='turn/end'){ended=true;console.log('child turn/end observed');finish('child completed')}
    });
    socket.addEventListener('error',()=>finish('socket error'));
  });
  console.log('result:',result,'child known:',!!childId,'start:',started,'end:',ended,'interrupt:',interruptAccepted);
  if(!started||!ended||!interruptAccepted)process.exitCode=1;
} finally {
  socket?.close();if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});
  if(wsId)await rpc('workspace/delete',{request:{workspaceId:wsId}}).catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
}

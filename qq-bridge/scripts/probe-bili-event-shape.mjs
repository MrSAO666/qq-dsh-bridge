import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { probeCookie, probeRpc, probeMuxSocket, probeWorkspaceDir } from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080', cookie=probeCookie({base}), rpc=probeRpc(cookie,{base}), dir=probeWorkspaceDir('bili-event-shape');
let workspaceId, sessionId, socket;
try {
  const w=await rpc('workspace/create',{request:{path:dir}}); if(!w.ok) throw Error('workspace failed'); workspaceId=w.value.workspace.workspaceId;
  const s=await rpc('session/create',{request:{workspaceId,agentPreset:'qq-chat-owner'}}); if(!s.ok) throw Error('session failed'); sessionId=s.value.sessionId;
  socket=probeMuxSocket(cookie,{base}); const parent=randomUUID(),child=randomUUID(); let found=false;
  const result=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve('timeout'),90000); const done=x=>{clearTimeout(timer);resolve(x)};
    socket.addEventListener('open',()=>{socket.send(JSON.stringify({type:'open',streamId:parent,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));
      setTimeout(async()=>{const p=await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'请调用 subagent，agent_preset 选择 qq-bili-worker，子任务描述必须为 bili-shape-probe。子任务只需回复“你好”。不要调用 QQ 工具。'}]}});if(!p.ok)done('prompt failed')},700);
    });
    socket.addEventListener('message',ev=>{let f;try{f=JSON.parse(ev.data)}catch{return}if(f.type!=='item')return;
      const events=f.value?.type==='snapshot'?f.value.records||[]:f.value?.type==='event'?[f.value.event]:[];
      for(const record of events){const e=record?.event||record;
        if(f.streamId===parent&&e.type==='subagent/catalog'&&!found){found=true;console.log('catalog:',JSON.stringify(e.data));socket.send(JSON.stringify({type:'open',streamId:child,endpoint:'session/follow',payload:{args:{request:{address:{kind:'subagent',parentSessionId:sessionId,childSessionId:e.data.childId,mode:e.data.mode}}}}}));}
        if(f.streamId===child){console.log('event:',e.type,'data-keys:',Object.keys(e.data||{}).join(','),'data:',e.type==='assistant/message'?JSON.stringify(e.data):'');if(e.type==='turn/end')done('ended');}
      }
    }); socket.addEventListener('error',()=>done('socket error'));
  });
  console.log('result:',result); if(result!=='ended')process.exitCode=1;
}finally{socket?.close();if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});if(workspaceId)await rpc('workspace/delete',{request:{workspaceId}}).catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}

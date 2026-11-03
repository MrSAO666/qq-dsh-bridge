import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { probeCookie,probeRpc,probeMuxSocket,probeWorkspaceDir } from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080',cookie=probeCookie({base}),rpc=probeRpc(cookie,{base}),dir=probeWorkspaceDir('bili-worker');
let wsId,sessionId,socket;
try {
  const ws=await rpc('workspace/create',{request:{path:dir}});if(!ws.ok)throw Error('workspace failed');wsId=ws.value.workspace.workspaceId;
  const s=await rpc('session/create',{request:{workspaceId:wsId,agentPreset:'qq-chat-owner'}});if(!s.ok)throw Error('owner session failed');sessionId=s.value.sessionId;
  socket=probeMuxSocket(cookie,{base});const parent=randomUUID(),child=randomUUID();let childId,mode,search=false,forbidden=false;
  const result=await new Promise(resolve=>{
    const timer=setTimeout(()=>resolve('timeout'),90000),finish=x=>{clearTimeout(timer);resolve(x)};
    socket.addEventListener('open',()=>{
      socket.send(JSON.stringify({type:'open',streamId:parent,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));
      setTimeout(async()=>{const p=await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:'这是独立验证会话，不要发送任何 QQ 消息。请调用 subagent，agent_preset 必须选 qq-bili-worker，要求子任务使用 B站搜索工具搜索 AI，取一条结果并简短汇报。'}]}});if(!p.ok)finish('prompt failed')},700);
    });
    socket.addEventListener('message',ev=>{
      let f;try{f=JSON.parse(ev.data)}catch{return};if(f.type!=='item')return;
      const events=f.value?.type==='snapshot'?f.value.records||[]:f.value?.type==='event'?[f.value.event]:[];
      for(const rec of events){const e=rec?.event||rec;
        if(f.streamId===parent&&e.type==='subagent/catalog'&&!childId){childId=e.data?.childId;mode=e.data?.mode;if(childId)socket.send(JSON.stringify({type:'open',streamId:child,endpoint:'session/follow',payload:{args:{request:{address:{kind:'subagent',parentSessionId:sessionId,childSessionId:childId,mode}}}}}));}
        if(f.streamId===child&&e.type==='tool/call'){const n=String(e.data?.name||'');if(n==='mcp__bili-read__bili_search')search=true;if(/^(bash|pwsh|read|write|edit|mcp__snowluma__)/.test(n))forbidden=true;}
        if(f.streamId===child&&e.type==='turn/end')finish('ended');
      }
    });
    socket.addEventListener('error',()=>finish('socket error'));
  });
  console.log('result',result,'child',!!childId,'B站搜索',search,'其他危险工具调用',forbidden);
  if(result!=='ended'||!search||forbidden)process.exitCode=1;
}finally{socket?.close();if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});if(wsId)await rpc('workspace/delete',{request:{workspaceId:wsId}}).catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}

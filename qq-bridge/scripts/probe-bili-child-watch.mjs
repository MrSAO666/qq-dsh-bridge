import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { watchBiliChild } from '../src/bili-child-watch.mjs';
import { probeCookie,probeRpc,probeWorkspaceDir } from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080',cookie=probeCookie({base}),rpc=probeRpc(cookie,{base}),dir=probeWorkspaceDir('bili-watch');
let workspaceId,sessionId,watcher;
try {
  const w=await rpc('workspace/create',{request:{path:dir}}); if(!w.ok)throw Error('workspace failed');workspaceId=w.value.workspace.workspaceId;
  const s=await rpc('session/create',{request:{workspaceId,agentPreset:'qq-chat-owner'}});if(!s.ok)throw Error('session failed');sessionId=s.value.sessionId;
  let started,resolveEnd;const finished=new Promise(resolve=>{resolveEnd=resolve});const runId=randomUUID();
  watcher=watchBiliChild({api:{baseUrl:base,ensureAuth:async()=>cookie},parentSessionId:sessionId,runId,onStart:x=>{started=x},onEnd:x=>resolveEnd(x),onError:e=>console.error('watch error:',e.message)});
  await watcher.ready;
  const p=await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:`请调用 subagent，agent_preset 选择 qq-bili-worker，子任务描述必须为 bili-${runId}。子任务只需回复“你好”，不要调用 QQ 工具。`}]}});
  if(!p.ok)throw Error('prompt failed');
  const end=await Promise.race([finished,new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),60000);timer.unref()})]);
  console.log('started:',!!started,'ended:',!!end,'same child:',started?.childId===end?.childId,'assistant text:',!!end?.text);
  if(!started||!end||started.childId!==end.childId||!end.text)process.exitCode=1;
}finally{watcher?.stop();if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});if(workspaceId)await rpc('workspace/delete',{request:{workspaceId}}).catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createBiliAutomation } from '../src/bili-automation.mjs';
import { probeCookie,probeRpc,probeWorkspaceDir } from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080',cookie=probeCookie({base}),rpc=probeRpc(cookie,{base}),dir=probeWorkspaceDir('bili-automation');
let workspaceId,sessionId,auto;
try {
  const w=await rpc('workspace/create',{request:{path:dir}});if(!w.ok)throw Error('workspace failed');workspaceId=w.value.workspace.workspaceId;
  const s=await rpc('session/create',{request:{workspaceId,agentPreset:'qq-chat-owner'}});if(!s.ok)throw Error('session failed');sessionId=s.value.sessionId;
  let report,resolve;const finished=new Promise(r=>resolve=r);
  const api={baseUrl:base,ensureAuth:async()=>cookie,callUnary:async(method,payload)=>({result:await rpc(method,payload)})};
  auto=createBiliAutomation({stateFile:path.join(dir,'run.json'),api,getConfig:()=>({enabled:true,autoEnabled:true,dailyRuns:1,durationMinutes:1,sources:{keywords:['AI资讯'],followUids:[],recommendations:false}}),getParent:async()=>sessionId,
    dispatchPrompt:async(id,prompt)=>rpc('session/prompt',{request:{sessionId:id,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:prompt+' 本次只搜索一个视频，最多读取一个视频字幕，尽快汇报。'}]}}),
    onReport:r=>{report=r;resolve()},log:s=>console.log(s)});
  await auto.tick();
  const timer=setTimeout(()=>resolve(),75000);timer.unref();await finished;clearTimeout(timer);
  const state=auto.snapshot();console.log('report:',!!report?.text,'completed:',state.active===null,'daily count:',Object.values(state.counts)[0]||0);
  if(!report?.text||state.active!==null||Object.values(state.counts)[0]!==1)process.exitCode=1;
}finally{auto?.dispose();if(sessionId)await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});if(workspaceId)await rpc('workspace/delete',{request:{workspaceId}}).catch(()=>{});fs.rmSync(dir,{recursive:true,force:true});}

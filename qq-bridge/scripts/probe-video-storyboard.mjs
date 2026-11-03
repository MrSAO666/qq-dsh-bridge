// Isolated runtime check: never sends QQ or B站 messages; archives its temporary session.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {probeCookie,probeRpc,probeMuxSocket,probeWorkspaceDir} from './probe-auth.mjs';
const base=process.env.DSH_BASE_URL||'http://127.0.0.1:3080',cookie=probeCookie({base}),rpc=probeRpc(cookie,{base}),dir=probeWorkspaceDir('video-storyboard');
let sessionId,workspaceId,socket;let images=0,tool=false,failed=false,forbidden=false,inputTokens=0;
try {
 const clip=path.join(dir,'colors.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:size=320x180:rate=5:d=2','-f','lavfi','-i','color=blue:size=320x180:rate=5:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[out]','-map','[out]','-c:v','libx264','-threads','1',clip]);
 const w=await rpc('workspace/create',{request:{path:dir}});if(!w.ok)throw Error('workspace failed');workspaceId=w.value.workspace.workspaceId;
 const s=await rpc('session/create',{request:{workspaceId,agentPreset:'qq-chat-owner'}});if(!s.ok)throw Error('session failed: '+JSON.stringify(s.error));sessionId=s.value.sessionId;
 socket=probeMuxSocket(cookie,{base});const streamId=randomUUID(),calls=new Map();
 const state=await new Promise(resolve=>{
  const timer=setTimeout(()=>finish('timeout'),100000);
  function finish(value){clearTimeout(timer);resolve(value);}
  socket.addEventListener('open',()=>{
   socket.send(JSON.stringify({type:'open',streamId,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));
   setTimeout(async()=>{
    const prompt=`仅验证本地视频分镜，不得调用任何 QQ 或B站收发/互动工具，不读记忆、不联网、不执行命令。请仅调用一次 video_storyboard，参数 ${JSON.stringify({input:clip,from:0,to:4,maxFrames:8,maxSheets:1,budget:360000,scanHeight:360,detail:'low',transcript:'off'})}。看到分镜图片后用一句话描述画面颜色变化，然后结束。`;
    const p=await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text:prompt}]}});if(!p.ok)finish('prompt failed');
   },700);
  });
  socket.addEventListener('message',ev=>{
   let frame;try{frame=JSON.parse(ev.data)}catch{return};if(frame.type!=='item'||frame.streamId!==streamId)return;
   const events=frame.value?.type==='snapshot'?frame.value.records||[]:frame.value?.type==='event'?[frame.value.event]:[];
   for(const record of events){const e=record?.event||record;
    if(e.type==='tool/call'){calls.set(e.data?.callId,e.data?.name);if(e.data?.name==='video_storyboard')tool=true;else forbidden=true;}
    if(e.type==='tool/result'&&calls.get(e.data?.message?.source?.callId)==='video_storyboard'){
     const m=e.data.message;failed=m.isError===true;images+=(m.content||[]).filter(c=>c.type==='image').length;
     console.log('VIDEO_RESULT',JSON.stringify({failed,images,text:(m.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('').slice(-320)}));
    }
    if(e.type==='assistant/message'){const u=e.data?.usage||{};inputTokens+=(u.inputTokens||0)+(u.cacheReadTokens||0);}
    if(e.type==='turn/end')finish('ended');
   }
  });
  socket.addEventListener('error',()=>finish('socket failed'));
 });
 console.log('VIDEO_RUNTIME',JSON.stringify({state,tool,images,failed,forbidden,inputTokens}));
 if(state!=='ended'||!tool||!images||failed||forbidden)process.exitCode=1;
} finally {
 socket?.close();if(sessionId){await rpc('session/cancel',{request:{sessionId}}).catch(()=>{});await rpc('workspace/archiveSession',{request:{sessionId}}).catch(()=>{});}
 if(workspaceId)await rpc('workspace/delete',{request:{workspaceId}}).catch(()=>{});
 fs.rmSync(dir,{recursive:true,force:true});
}

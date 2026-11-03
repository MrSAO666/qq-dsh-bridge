import { randomUUID } from 'node:crypto';

// Read-only accounting stream. Never creates, prompts or interrupts an agent.
export function createTokenChildObserver({api,audit,onSnapshot,onEvent,log=()=>{},socketFactory=(url,opts)=>new WebSocket(url,opts),maxConnections=4}) {
  const seen=new Map(),queue=[];let active=0,disposed=false;
  function follow({parentSessionId,childSessionId,mode='continuable',label='',key,refresh=false}) {
    if(disposed||!parentSessionId||!childSessionId||parentSessionId===childSessionId)return;
    const prev=seen.get(childSessionId);
    const runId=/^bili-([a-f0-9-]{36})$/i.exec(label)?.[1];
    audit.registerSession({sessionId:childSessionId,parentSessionId,mode,label,key,role:'child',...(runId?{category:'bili',runId}:{category:prev?.category||audit.sessionMeta(childSessionId)?.category||'internal'})});
    if(prev && (!refresh||!prev.done))return;
    const entry={parentSessionId,childSessionId,mode,label,key,attempt:0,done:false};
    seen.set(childSessionId,entry);queue.push(entry);pump();
  }
  function pump(){while(!disposed&&active<maxConnections&&queue.length){const e=queue.shift();active++;void open(e);}}
  async function open(e){
    let ws,timeout,closed=false,retry=false;
    function finish(willRetry=false){
      if(closed)return;closed=true;clearTimeout(timeout);e.done=!willRetry;
      if(ws&&ws.readyState<2)ws.close();active--;pump();
      if(willRetry&&!disposed){e.timer=setTimeout(()=>{e.timer=null;queue.push(e);pump()},Math.min(30000,3000*e.attempt));e.timer.unref?.();}
    }
    try{
      e.attempt++;
      const cookie=await api.ensureAuth();if(disposed){finish();return;}
      const url=new URL('/api/remote.mux',api.baseUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      ws=socketFactory(url,{headers:{cookie}});e.socket=ws;
      timeout=setTimeout(()=>{log('子 Agent 用量读取等待超时');finish(e.attempt<4)},15000);timeout.unref?.();
      const streamId=randomUUID();
      ws.addEventListener('open',()=>{if(!closed)ws.send(JSON.stringify({type:'open',streamId,endpoint:'session/follow',payload:{args:{request:{address:{kind:'subagent',parentSessionId:e.parentSessionId,childSessionId:e.childSessionId,mode:e.mode}}}}}))});
      ws.addEventListener('message',({data})=>{
        if(closed||disposed)return;
        try{
          const f=JSON.parse(data);
          if(f.type==='error'){log('子 Agent 用量接口未确认，等待重试');finish(e.attempt<4);return;}
          if(f.type!=='item'||f.streamId!==streamId)return;
          const v=f.value;if(!v)return;
          clearTimeout(timeout);
          if(v.type==='snapshot'){
            const preset=v.projections?.values?.agentPreset;
            if(preset==='qq-bili-worker')audit.registerSession({sessionId:e.childSessionId,category:'bili',runId:audit.sessionMeta(e.childSessionId)?.runId||e.childSessionId});
            onSnapshot(e.childSessionId,v);
            const records=Array.isArray(v.records)?v.records.map(x=>x.event||x):[];
            let running=false,ended=false;
            for(const r of records){if(r.type==='turn/start'){running=true;ended=false}if(r.type==='turn/end'){running=false;ended=true}}
            if(ended&&!running)finish();
          }else if(v.type==='event'){
            onEvent(e.childSessionId,v.event);
            if(v.event?.type==='turn/end')finish();
          }
        }catch(err){log('子 Agent 用量记录失败：'+err.message);}
      });
      ws.addEventListener('error',()=>{retry=true;});
      ws.addEventListener('close',()=>{if(!closed)finish(!disposed&&e.attempt<4);});
    }catch(err){log('子 Agent 用量监听失败：'+err.message);finish(e.attempt<4);}
  }
  function observeParent(sid,snapshotOrEvent,isSnapshot=false){
    const meta=audit.sessionMeta(sid),key=meta?.key;
    if(isSnapshot){
      const catalog=snapshotOrEvent?.projections?.values?.subagentCatalog;
      for(const c of Array.isArray(catalog)?catalog:[])follow({parentSessionId:sid,childSessionId:c.id,mode:c.mode,label:c.label,key});
    }else if(snapshotOrEvent?.type==='subagent/catalog'){
      const d=snapshotOrEvent.data;follow({parentSessionId:sid,childSessionId:d.childId,mode:d.mode,label:d.label,key,refresh:true});
    }else if(snapshotOrEvent?.type==='user/message'&&snapshotOrEvent.data?.source?.kind==='subagent-settled'){
      const c=audit.sessionMeta(snapshotOrEvent.data.source.senderSessionId);
      if(c)follow({parentSessionId:c.parentSessionId,childSessionId:c.sid,mode:c.mode,label:c.label,key:c.key,refresh:true});
    }
  }
  function dispose(){disposed=true;queue.length=0;for(const e of seen.values()){if(e.timer)clearTimeout(e.timer);if(e.socket&&e.socket.readyState<2)e.socket.close();}}
  return {follow,observeParent,dispose};
}

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeBiliConfig } from './bili-config.mjs';
import { reserveBiliInteraction } from './bili-interaction-policy.mjs';

// One short-lived filesystem lock protects reservations across MCP processes.
// A stale lock intentionally blocks actions until inspected by the operator.
export function createBiliInteractions({ dataDir, call, watched }) {
  const lock=path.join(dataDir,'interaction.lock'), ledger=path.join(dataDir,'interactions.json'), events=path.join(dataDir,'events.jsonl');
  function append(row) { fs.appendFileSync(events,JSON.stringify({time:new Date().toISOString(),...row})+'\n',{mode:0o600}); }
  function reserve(kind, text) {
    fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
    try { fs.mkdirSync(lock,{mode:0o700}); } catch(e) { if(e.code==='EEXIST')throw Error('互动记录繁忙或需要人工检查');throw e; }
    try {
      const config=normalizeBiliConfig(JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8')));
      let state;try{state=JSON.parse(fs.readFileSync(ledger,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,counts:{}}}
      const next=reserveBiliInteraction(state,{kind,config,text,mentionUids:[]});
      const tmp=path.join(dataDir,`.interaction.${process.pid}.${randomUUID()}.tmp`);
      try { fs.writeFileSync(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,ledger); }
      catch(e){try{fs.unlinkSync(tmp)}catch{}throw e}
    } finally { fs.rmdirSync(lock); }
  }
  async function perform({kind,bvid,text='',rpid=0,root=0,replyTo=''}) {
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid) || !watched.has(bvid)) throw Error('只能互动已读取字幕的视频');
    if (!Number.isSafeInteger(rpid)||rpid<0||!Number.isSafeInteger(root)||root<0||typeof replyTo!=='string'||replyTo.length>100)throw Error('回复目标无效');
    const action=kind==='like'?'点赞':rpid?'回复':'评论';
    if(kind==='comment' && rpid>0 && !replyTo.trim())throw Error('回复时必须记录目标');
    const details={operationId:randomUUID(),action,bvid,...(kind==='comment'?{content:text,...(rpid?{replyTo:`${replyTo}（评论 ${rpid}）`}:{})}:{})};
    reserve(kind,text);
    // Audit must be durable before a public write; never auto-retry uncertainty.
    append({...details,state:'开始'});
    let result;
    try { result=await call(kind==='like'?'bili_like':'bili_reply',kind==='like'?{bvid,like:true}:{bvid,text,rpid,root}); }
    catch(e){append({...details,state:'不确定'});throw Error('互动结果不确定，请查看 B站和日志，勿重复发送');}
    const ok=kind==='like'?result?.ok===true&&result?.has_liked===true:result?.success===true;
    // A server can apply the write and fail during its follow-up check, so a
    // negative/ambiguous response is not proof that nothing was published.
    append({...details,state:ok?'完成':'不确定'});
    return {ok,...(!ok?{uncertain:true,error:'B站未确认操作结果，请勿重复发送'}:{})};
  }
  return {perform};
}

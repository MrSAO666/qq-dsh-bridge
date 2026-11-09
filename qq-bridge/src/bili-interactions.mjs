import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { safeFetchBuffer } from './safe-fetch.js';
import { normalizeBiliConfig } from './bili-config.mjs';
import { reserveBiliInteraction } from './bili-interaction-policy.mjs';

// One short-lived filesystem lock protects reservations across MCP processes.
// A stale lock intentionally blocks actions until inspected by the operator.
export function createBiliInteractions({ dataDir, call, watched, resolveSticker, fetchImage = safeFetchBuffer }) {
  const lock=path.join(dataDir,'interaction.lock'), ledger=path.join(dataDir,'interactions.json'), events=path.join(dataDir,'events.jsonl');
  function append(row) { fs.appendFileSync(events,JSON.stringify({time:new Date().toISOString(),...row})+'\n',{mode:0o600}); }
  function reserve(kind, text, receiverUid = '', mentionUids = []) {
    fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
    try { fs.mkdirSync(lock,{mode:0o700}); } catch(e) { if(e.code==='EEXIST')throw Error('互动记录繁忙或需要人工检查');throw e; }
    try {
      const config=normalizeBiliConfig(JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8')));
      let state;try{state=JSON.parse(fs.readFileSync(ledger,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,counts:{}}}
      const next=reserveBiliInteraction(state,{kind,config,text,mentionUids,receiverUid});
      const tmp=path.join(dataDir,`.interaction.${process.pid}.${randomUUID()}.tmp`);
      try { fs.writeFileSync(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,ledger); }
      catch(e){try{fs.unlinkSync(tmp)}catch{}throw e}
    } finally { fs.rmdirSync(lock); }
  }
  async function sendDm({receiverUid,text}) {
    if (typeof receiverUid !== 'string' || !/^[1-9]\d{0,15}$/.test(receiverUid) || !Number.isSafeInteger(Number(receiverUid))) throw Error('私信收件人无效');
    const details={operationId:randomUUID(),action:'私信',receiverUid,content:text};
    reserve('dm',text,receiverUid);
    append({...details,state:'开始'});
    let result;
    try { result=await call('bili_send_message',{receiver_uid:Number(receiverUid),text}); }
    catch { append({...details,state:'不确定'}); throw Error('私信结果不确定，请查看 B站和日志，勿重复发送'); }
    const ok=result?.success===true;
    append({...details,state:ok?'完成':'不确定'});
    return {ok,...(!ok?{uncertain:true,error:'B站未确认私信结果，请勿重复发送'}:{})};
  }
  async function perform({kind,bvid,text='',rpid=0,root=0,replyTo='',mentionUids=[],stickerId=''}) {
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid) || !watched.has(bvid)) throw Error('只能互动已读取字幕的视频');
    if (!Number.isSafeInteger(rpid)||rpid<0||!Number.isSafeInteger(root)||root<0||typeof replyTo!=='string'||replyTo.length>100)throw Error('回复目标无效');
    const action=kind==='like'?'点赞':rpid?'回复':'评论';
    if(kind==='comment' && rpid>0 && !replyTo.trim())throw Error('回复时必须记录目标');
    if(stickerId && (kind!=='comment'||typeof stickerId!=='string'||!stickerId.startsWith('nekowhale:')||stickerId.length>240||!resolveSticker))throw Error('表情编号无效');
    let stickerGif;
    if(stickerId){
      const cfg=normalizeBiliConfig(JSON.parse(fs.readFileSync(path.join(dataDir,'config.json'),'utf8')));
      if(!cfg.interactions.commentEnabled)throw Error('评论功能未启用');
      const sticker=await resolveSticker(stickerId);
      if(!sticker||!/^https:\/\/kiriyuki\.com\//.test(sticker.url||'')||!/^[0-9a-f]{12}$/i.test(sticker.hash||''))throw Error('表情不存在或已禁用');
      const image=await fetchImage(sticker.url,2*1024*1024);
      if(image.buffer.length>2*1024*1024||image.buffer.subarray(0,3).toString('ascii')!=='GIF'||createHash('sha1').update(image.buffer).digest('hex').slice(0,12)!==sticker.hash)throw Error('表情图片校验失败');
      const current=await resolveSticker(stickerId);
      if(!current||current.hash!==sticker.hash)throw Error('表情已关闭或更新，请重新选择');
      stickerGif=image.buffer.toString('base64');
    }
    const details={operationId:randomUUID(),action,bvid,...(kind==='comment'?{content:text,...(stickerId?{stickerId}:{}),...(mentionUids.length?{mentionUids}:{}),...(rpid?{replyTo:`${replyTo}（评论 ${rpid}）`}:{})}:{})};
    reserve(kind,text,'',mentionUids);
    // Audit must be durable before a public write; never auto-retry uncertainty.
    append({...details,state:'开始'});
    let result;
    try { result=await call(kind==='like'?'bili_like':'bili_reply',kind==='like'?{bvid,like:true}:{bvid,text,rpid,root,...(stickerGif?{sticker_gif:stickerGif}:{}),...(mentionUids.length?{mention_uids:mentionUids.map(Number)}:{})}); }
    catch(e){const reason='调用中断，无法判断请求是否已经发送；请到视频页面核实，确认前不要重复操作。';append({...details,state:'不确定',reason});return {ok:false,uncertain:true,status:'unknown',message:reason};}
    const ok=kind==='like'?result?.ok===true&&result?.has_liked===true:result?.success===true;
    // A server can apply the write and fail during its follow-up check, so a
    // negative/ambiguous response is not proof that nothing was published.
    if (ok) {
      const message=kind==='like'?'已回读确认视频处于点赞状态。':'B站接口已接受评论；是否公开可见需在视频评论区核实。';
      append({...details,state:'完成',reason:message});
      return {ok:true,status:kind==='like'?'verified':'accepted',message,...(result.rpid?{commentId:String(result.rpid)}:{})};
    }
    const raw=typeof result?.error==='string'?result.error:'';
    const code=raw.match(/(?:code\s*[=:：]\s*|错误码\s*[=:：]?\s*)(-?\d+)/i)?.[1];
    const notSent=/还没登录 B站|目标评论已不存在|圈地自萌开启/.test(raw);
    const reason=notSent?'发送前检查未通过，操作没有发送：'+(raw.includes('目标评论')?'目标评论已不存在。':raw.includes('圈地自萌')?'当前模式禁止发表新评论。':'B站尚未登录。')
      :kind==='like'&&result?.ok===true&&result?.has_liked===false?'点赞请求后回读显示未点赞，可能未生效；请到视频页面核实。'
      :`B站未能确认${action}是否生效${code?`（错误码 ${code}）`:''}；可能失败，也可能已生效，请先到视频页面核实，确认前不要重复操作。`;
    append({...details,state:notSent?'失败':'不确定',reason});
    return {ok:false,uncertain:!notSent,status:notSent?'not_sent':'unknown',error:reason,...(code?{code}: {})};
  }
  return {perform,sendDm};
}

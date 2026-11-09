import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeXiaoheiheConfig } from './xiaoheihe-config.mjs';

// A durable intent is recorded before sending. Unknown outcomes count against quota and
// are never automatically retried; the lock prevents concurrent child agents racing.
export function createXiaoheiheComments({ directory, client, now = Date.now }) {
 const configPath=path.join(directory,'config.json'), statePath=path.join(directory,'comment-actions.json'), lockPath=path.join(directory,'comment-actions.lock'), logPath=path.join(directory,'events.jsonl');
 async function send({postId,text,readPosts}) {
  postId=String(postId||''); text=String(text||'').trim();
  if(!/^\d{1,24}$/.test(postId)||!readPosts?.has(postId))throw Error('请先读取指定帖子');
  if(!text||text.length>500||/[\u0000-\u0008]/.test(text))throw Error('评论内容无效');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  let lock;try{lock=fs.openSync(lockPath,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('评论操作正在进行或锁待检查');throw e}
  const save=s=>{const tmp=statePath+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600,flag:'wx'});fs.renameSync(tmp,statePath)}finally{try{fs.unlinkSync(tmp)}catch{}}};
  try{
   const c=normalizeXiaoheiheConfig(JSON.parse(fs.readFileSync(configPath,'utf8')));
   if(!c.enabled||!c.commentEnabled)throw Error('小黑盒评论未开启');
   let state;try{state=JSON.parse(fs.readFileSync(statePath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('评论记录读取失败，已停止发送');state={actions:[]}}
   if(!Array.isArray(state.actions))throw Error('评论记录无效，已停止发送');
   const time=now(), day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(time);
   if(state.actions.some(a=>a.postId===postId))throw Error('此帖子已有评论记录或发送结果未知，请勿重复发送');
   if(state.actions.filter(a=>a.day===day).length>=c.dailyCommentLimit)throw Error('今日评论额度已用完');
   if(state.actions.length&&time-Math.max(...state.actions.map(a=>Number(a.at)||0))<c.commentCooldownSeconds*1000)throw Error('评论冷却中');
   const action={id:crypto.randomUUID(),postId,text,at:time,day,status:'unknown'};state.actions.push(action);save(state);
   const log=()=>fs.appendFileSync(logPath,JSON.stringify({at:time,action:'发表评论',result:action.status,postId,url:`https://www.xiaoheihe.cn/app/bbs/link/${postId}`,content:text})+'\n',{mode:0o600});
   try {const result=await client.comment(postId,text);action.commentId=result.commentId||'';action.status=action.commentId?'sent':'accepted';save(state);log();return {ok:true,status:action.status,commentId:action.commentId,postId};}
   catch(e){log();throw Error('评论发送结果未确认，已记录并禁止自动重复发送');}
  } finally {fs.closeSync(lock);try{fs.unlinkSync(lockPath)}catch{}}
 }
 return {send};
}

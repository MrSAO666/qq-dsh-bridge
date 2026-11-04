import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { createBiliInteractions } from '../src/bili-interactions.mjs';import { DEFAULT_BILI_CONFIG } from '../src/bili-config.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-actions-')),bvid='BV1abcdefgh1';
try {
  const config=structuredClone(DEFAULT_BILI_CONFIG);config.interactions.likeEnabled=true;config.interactions.likeDailyLimit=1;config.interactions.commentEnabled=true;config.interactions.commentDailyLimit=2;
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(config));let calls=[];const watched=new Set();
  const service=createBiliInteractions({dataDir:dir,watched,call:async(name,args)=>{calls.push({name,args});return name==='bili_like'?{ok:true,has_liked:true}:{success:true}}});
  await assert.rejects(service.perform({kind:'like',bvid}),/字幕/);watched.add(bvid);
  assert.equal((await service.perform({kind:'like',bvid})).ok,true);await assert.rejects(service.perform({kind:'like',bvid}),/额度/);
  await assert.rejects(service.perform({kind:'comment',bvid,text:'@别人'}),/未授权/);
  await assert.rejects(service.perform({kind:'comment',bvid,text:'同意',rpid:123}),/目标/);
  assert.equal((await service.perform({kind:'comment',bvid,text:'确实很有意思',rpid:123,replyTo:'某位用户'})).ok,true);
  const rows=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.at(-1).action,'回复');assert.equal(rows.at(-1).bvid,bvid);assert.equal(rows.at(-1).content,'确实很有意思');assert.match(rows.at(-1).replyTo,/123/);assert.equal(calls.length,2);
  const uncertain=createBiliInteractions({dataDir:dir,watched,call:async()=>({success:false})});
  assert.equal((await uncertain.perform({kind:'comment',bvid,text:'说得不错'})).uncertain,true);
  const last=JSON.parse(fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').trim().split('\n').at(-1));assert.equal(last.state,'不确定');
  config.interactions.commentDailyLimit=5;config.interactions.mentionEnabled=true;config.interactions.mentionUids=['123'];
  config.interactions.dmEnabled=true;config.interactions.dmDailyLimit=1;config.interactions.dmUids=['123'];
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(config));
  await assert.rejects(service.perform({kind:'comment',bvid,text:'不错',mentionUids:['124']}),/不在名单/);
  assert.equal((await service.perform({kind:'comment',bvid,text:'值得看看',mentionUids:['123']})).ok,true);
  assert.deepEqual(calls.at(-1).args.mention_uids,[123]);
  await assert.rejects(service.sendDm({receiverUid:'124',text:'你好'}),/收件人/);
  assert.equal((await service.sendDm({receiverUid:'123',text:'你好'})).ok,true);
  assert.deepEqual(calls.at(-1),{name:'bili_send_message',args:{receiver_uid:123,text:'你好'}});
  await assert.rejects(service.sendDm({receiverUid:'123',text:'你好'}),/额度/);
  console.log('B站互动限额和审计测试通过');
}finally{fs.rmSync(dir,{recursive:true,force:true})}

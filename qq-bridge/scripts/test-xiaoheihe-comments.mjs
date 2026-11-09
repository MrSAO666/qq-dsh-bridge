import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createXiaoheiheComments} from '../src/xiaoheihe-comments.mjs';
import {DEFAULT_XIAOHEIHE_CONFIG} from '../src/xiaoheihe-config.mjs';
import {createXiaoheiheClient} from '../src/xiaoheihe-client.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xhh-comments-'));let n=0;let time=Date.UTC(2026,10,6,4);let fail=false;
const save=c=>fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(c));
const agent=createXiaoheiheComments({directory:dir,now:()=>time,client:{comment:async()=>{n++;if(fail)throw Error('network');return {commentId:'42'}}}});
try{
 let cfg={...DEFAULT_XIAOHEIHE_CONFIG,enabled:true};save(cfg);
 await assert.rejects(()=>agent.send({postId:'123',text:'hi',readPosts:new Set(['123'])}),/未开启/);
 cfg.commentEnabled=true;cfg.dailyCommentLimit=2;save(cfg);
 await assert.rejects(()=>agent.send({postId:'123',text:'hi',readPosts:new Set()}),/先读取/);
 const ok=await agent.send({postId:'123',text:'hi',readPosts:new Set(['123'])});assert.equal(ok.status,'sent');assert.equal(n,1);
 await assert.rejects(()=>agent.send({postId:'123',text:'hi',readPosts:new Set(['123'])}),/重复/);
 await assert.rejects(()=>agent.send({postId:'124',text:'hi',readPosts:new Set(['124'])}),/冷却/);
 time+=61000;fail=true;await assert.rejects(()=>agent.send({postId:'124',text:'hi',readPosts:new Set(['124'])}),/未确认/);
 fail=false;await assert.rejects(()=>agent.send({postId:'124',text:'hi',readPosts:new Set(['124'])}),/重复/);
 await assert.rejects(()=>agent.send({postId:'125',text:'hi',readPosts:new Set(['125'])}),/额度/);
 assert.equal(n,2);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'comment-actions.json'))).actions[1].status,'unknown');
 let request; const c=createXiaoheiheClient({getCredentials:()=>({cookie:'fixture',heyboxId:'123',deviceId:'a'.repeat(32)}),fetchImpl:async(url,options)=>{request={url,options};return {ok:true,body:(async function*(){yield Buffer.from(JSON.stringify({status:'ok',result:{commentid:'987'}}))})()}}});
 const receipt=await c.comment('123','日常');assert.equal(receipt.commentId,'987');assert.equal(request.options.method,'POST');assert.ok(new URL(request.url).searchParams.get('_rnd').startsWith('15:'));assert.equal(new URLSearchParams(request.options.body).get('link_id'),'123');
 console.log('comments gate, quota, cooldown, deduplication and uncertain outcome passed');
}finally{fs.rmSync(dir,{recursive:true,force:true})}

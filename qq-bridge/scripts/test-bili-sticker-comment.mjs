import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {createBiliInteractions} from '../src/bili-interactions.mjs';import {DEFAULT_BILI_CONFIG} from '../src/bili-config.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-sticker-'));const bvid='BV1abcdefgh1';const gif=Buffer.from('GIF89a-test');const hash=crypto.createHash('sha1').update(gif).digest('hex').slice(0,12);let calls=[];let cfg=structuredClone(DEFAULT_BILI_CONFIG);
const save=()=>fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg));save();
const service=createBiliInteractions({dataDir:dir,watched:new Set([bvid]),resolveSticker:async()=>({url:'https://kiriyuki.com/fixture.gif',hash}),fetchImage:async()=>({buffer:gif}),call:async(name,args)=>{calls.push({name,args});return {success:true,rpid:123}}});
try{
 await assert.rejects(()=>service.perform({kind:'comment',bvid,text:'不错',stickerId:'nekowhale:fixture/a'}),/未启用/);assert.equal(calls.length,0);
 cfg.interactions.commentEnabled=true;cfg.interactions.commentDailyLimit=2;cfg.interactions.mentionEnabled=true;cfg.interactions.mentionUids=['123'];save();
 const result=await service.perform({kind:'comment',bvid,text:'有趣',stickerId:'nekowhale:fixture/a',mentionUids:['123']});assert.equal(result.ok,true);assert.equal(calls[0].args.sticker_gif,gif.toString('base64'));assert.deepEqual(calls[0].args.mention_uids,[123]);
 const logs=fs.readFileSync(path.join(dir,'events.jsonl'),'utf8');assert.ok(logs.includes('nekowhale:fixture/a'));assert.ok(!logs.includes(gif.toString('base64')));
 const bad=createBiliInteractions({dataDir:dir,watched:new Set([bvid]),resolveSticker:async()=>({url:'https://kiriyuki.com/a',hash:'000000000000'}),fetchImage:async()=>({buffer:gif}),call:async()=>{throw Error('should not send')}});
 await assert.rejects(()=>bad.perform({kind:'comment',bvid,text:'不错',stickerId:'nekowhale:fixture/a'}),/校验失败/);
 console.log('B站表情评论开关、白名单、图片校验、日志和模拟发送通过');
}finally{fs.rmSync(dir,{recursive:true,force:true})}

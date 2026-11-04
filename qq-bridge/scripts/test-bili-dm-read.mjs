import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { DEFAULT_BILI_CONFIG } from '../src/bili-config.mjs';
import { createBiliDmReader } from '../src/bili-dm-read.mjs';
import { toolGuardReason } from '../plugins/qq-agent-presets/qq-tool-restrict.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-dm-read-'));
try {
 const cfg=structuredClone(DEFAULT_BILI_CONFIG);const save=()=>fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg));save();let calls=0;
 const read=createBiliDmReader({dataDir:dir,call:async(name,args)=>{calls++;assert.equal(name,'bili_dm_inbox');assert.deepEqual(args,{uid:123,limit:10});return {ok:true,items:[{dir:'in',text:'你好',ts:1}]}}});
 await assert.rejects(read(),/未开启/);cfg.interactions.dmReadEnabled=true;cfg.interactions.dmReadUids=['123'];save();
 assert.deepEqual((await read()).allowedUids,['123']);await assert.rejects(read({uid:'124'}),/名单/);
 assert.equal((await read({uid:'123'})).items[0].text,'你好');assert.equal(calls,1);
 const tool={name:'mcp__bili-read__bili_read_dm'};
 assert.equal(toolGuardReason('open',tool),undefined);assert.ok(toolGuardReason('bili',tool));assert.ok(toolGuardReason('strict',tool));
 console.log('私信读取白名单与权限隔离通过');
} finally {fs.rmSync(dir,{recursive:true,force:true})}

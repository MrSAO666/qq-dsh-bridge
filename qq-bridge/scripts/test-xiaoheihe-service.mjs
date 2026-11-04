import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createXiaoheiheService } from '../src/xiaoheihe-service.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xhh-test-'));
try {
 let count=0;
 const fetchImpl=async(url)=>{
   const p=new URL(url).pathname;
   if (p.includes('get_qrcode_url')) return new Response(JSON.stringify({status:'ok',result:{qr_url:'https://api.xiaoheihe.cn/account/qr_login/?qr=secret',expire:120}}));
   if (p.includes('qr_state')) return new Response(JSON.stringify({status:'ok',result:{error:'ok',profile:{heybox_id:123},pkey:'secret-value'}}));
   count++; return new Response(JSON.stringify({status:'ok',result:{links:[]}}));
 };
 const svc=createXiaoheiheService({directory:dir,encode:async()=> 'data:image/png;base64,abc',fetchImpl});
 const start=await svc.login.start(); assert.equal(start.status,'waiting');
 const finish=await svc.login.poll(start.sessionId); assert.equal(finish.status,'authenticated');
 assert.equal(JSON.stringify(finish).includes('secret-value'),false);
 assert.equal(svc.status().configured,true);
 await svc.client.feed(); assert.equal(count,1);
 assert.ok(fs.readFileSync(path.join(dir,'account.json'),'utf8').includes('secret-value'));
 svc.logout(); assert.equal(svc.status().configured,false);
 assert.equal(fs.readFileSync(path.join(dir,'account.json'),'utf8').includes('secret-value'),false);
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
console.log('小黑盒登录与账号保存检查通过');

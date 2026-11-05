import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOnebotGateway} from '../src/onebot-gateway.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'qq-gateway-test-'));
try {
  const catalogFile=path.join(root,'initial.json');
  const actions=[{name:'get_login_info',readOnly:true,params:[]},{name:'set_qq_profile',params:[{name:'nickname',required:true,schema:{type:'string'}}]},{name:'get_cookies',params:[]}];
  fs.writeFileSync(catalogFile,JSON.stringify({actions}));
  let calls=0;
  const g=createOnebotGateway({directory:path.join(root,'state'),catalogFile,request:async()=>{calls++;return {status:'ok',retcode:0,data:{name:'ok',accessToken:'private'}}}});
  assert.equal(g.list().length,2);
  assert.equal((await g.call('get_login_info',{})).data.accessToken,undefined);
  await assert.rejects(()=>g.call('get_cookies',{}));
  await assert.rejects(()=>g.call('set_qq_profile',{nickname:1}));
  await assert.rejects(()=>g.call('set_qq_profile',{nickname:'x',unknown:1}));
  assert.equal(calls,1);
  const many=Array.from({length:219},(_,i)=>({name:i===0?'get_login_info':'action_'+i,params:[],readOnly:true}));
  let logout=false;
  const fake=async(url,options)=>{
    if(url.endsWith('/api/login'))return {ok:true,json:async()=>({success:true,token:'temporary-secret'})};
    if(url.endsWith('/api/debug/actions')){assert.equal(options.headers['x-snowluma-token'],'temporary-secret');return {ok:true,text:async()=>JSON.stringify({actions:many})};}
    if(url.endsWith('/api/logout')){logout=true;return {ok:true};}
    throw Error('unexpected URL');
  };
  const before=g.config();
  assert.deepEqual(await g.syncCatalog({url:'http://127.0.0.1:5099',password:'password-secret',totp:''},fake),{total:219,available:219,added:218,removed:2});
  assert.deepEqual(g.stats(),{total:219,available:219});
  assert.equal(logout,true);
  assert.equal(g.list().length,219);
  assert.deepEqual(g.config(),before);
  assert.equal(g.list('action_218')[0].allowed,false);
  assert.ok(!fs.readFileSync(path.join(root,'state','catalog.json'),'utf8').includes('temporary-secret'));
  assert.ok(!fs.readFileSync(path.join(root,'state','catalog.json'),'utf8').includes('password-secret'));
  await assert.rejects(()=>g.syncCatalog({url:'http://example.com',password:'x',totp:''},fake));
  await assert.rejects(()=>g.call('action_218',{}));
  g.saveConfig({enabled:true,allowed:['get_login_info','action_218']});
  assert.equal((await g.call('action_218',{})).status,'accepted');
  assert.ok(g.logs().some(x=>x.action==='action_218'&&x.result==='accepted'));
  console.log('onebot gateway checks passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}

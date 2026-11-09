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
  for(const scenario of ['matched','not_matched','unavailable']){
    const verify=createOnebotGateway({directory:path.join(root,'verify-'+scenario),catalogFile,request:async(action)=>{
      if(action==='get_login_info')return {status:'ok',retcode:0,data:{user_id:123}};
      if(action==='get_stranger_info')return scenario==='unavailable'?{status:'failed',retcode:1}:{status:'ok',retcode:0,data:{nickname:scenario==='matched'?'new':'old'}};
      return {status:'ok',retcode:0,data:null};
    }});
    const result=await verify.call('set_qq_profile',{nickname:'new'});
    assert.equal(result.status,scenario==='matched'?'verified':'unconfirmed');
    assert.equal(result.fields.nickname,scenario);
    assert.equal(verify.logs()[0].result,scenario==='matched'?'verified':'unconfirmed');
  }
  const generalFile=path.join(root,'general.json');
  fs.writeFileSync(generalFile,JSON.stringify({actions:[{name:'send_example',readOnly:false,params:[]}]}));
  for(const failure of [false,true]){
    let count=0;
    const general=createOnebotGateway({directory:path.join(root,'general-'+failure),catalogFile:generalFile,request:async()=>{
      count++;return failure?{status:'failed',retcode:1001,wording:'private secret'}:{status:'ok',retcode:0,data:{message_id:42,accessToken:'private'}};
    }});
    general.saveConfig({enabled:true,allowed:['send_example']});
    if(failure)await assert.rejects(()=>general.call('send_example',{}),/错误码 1001/);
    else {
      const result=await general.call('send_example',{});
      assert.equal(result.status,'accepted');
      assert.equal(result.data.message_id,42);
      assert.equal(result.data.accessToken,undefined);
      assert.match(result.message,/尚未回读确认/);
    }
    assert.equal(count,1);
    assert.equal(general.logs()[0].result,failure?'failed':'accepted');
  }
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
  const supplements=path.join(root,'supplements.json');
  fs.writeFileSync(supplements,JSON.stringify({actions:[{name:'.get_word_slices',summary:'分词（未实现）',readOnly:true,params:[]},{name:'set_group_anonymous',summary:'匿名开关（未实现，返回 ok）',params:[]},{name:'get_status',readOnly:true,params:[]},{name:'can_send_image',summary:'上游自定义说明',readOnly:true,params:[]}]}));
  let remoteCalls=0;
  const extra=createOnebotGateway({directory:path.join(root,'supplement-state'),catalogFile:supplements,request:async()=>{remoteCalls++;return {status:'ok',retcode:0,data:{}}}});
  extra.saveConfig({enabled:true,allowed:['.get_word_slices','set_group_anonymous','get_status','can_send_image']});
  assert.match(extra.list('get_status')[0].summary,/状态/);
  assert.equal(extra.list('can_send_image')[0].summary,'上游自定义说明');
  const words=await extra.call('.get_word_slices',{content:'今天天气不错'});
  assert.ok(words.data.slices.length>0);assert.match(words.message,/本地分词/);
  await assert.rejects(()=>extra.call('.get_word_slices',{}),/缺少必填参数/);
  await assert.rejects(()=>extra.call('set_group_anonymous',{}),/未实现/);
  await assert.rejects(()=>extra.call('set_group_anonymous',{group_id:123,enable:true}),/未实现/);
  assert.equal(remoteCalls,0,'占位接口不得伪报成功或发送请求');
  fs.writeFileSync(supplements,JSON.stringify({actions:[{name:'.get_word_slices',summary:'上游分词已实现',readOnly:true,params:[{name:'content',required:true,schema:{type:'string'}}]}]}));
  const native=await extra.call('.get_word_slices',{content:'测试'});
  assert.equal(remoteCalls,1,'上游实现后优先调用上游');assert.equal(native.status,'accepted');
  console.log('onebot gateway checks passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}

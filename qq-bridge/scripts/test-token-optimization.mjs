import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createExecutionBudget} from '../plugins/qq-agent-context/execution-budget.mjs';
import {createImageObservations} from '../src/image-observations.mjs';
import {createTextArtifacts} from '../src/text-artifacts.mjs';
import {createTokenLedger} from '../src/token-ledger.js';
import {createSendTiming,replySendDelay} from '../src/send-timing.mjs';
import {bridgeHarness} from './audit-bridge-harness.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qq-token-optimization-'));
try {
  assert.equal(replySendDelay({now:107000,lastIncomingAt:100000,firstReplyMinMs:15000}),8000);
  let clock=107000,incoming=100000,changed=false;
  const timing=createSendTiming({now:()=>clock,getState:()=>({lastIncomingAt:incoming}),getConfig:()=>({firstReplyMinMs:15000,burstIntervalMinMs:15000}),sleep:async ms=>{clock+=ms;if(!changed&&clock>=110000){incoming=110000;changed=true;}}});
  await timing.wait('private:1');assert.equal(clock,125000,'补充消息后从最后一条重新等满15秒');
  timing.sent('private:1');await timing.wait('private:1');assert.equal(clock,140000,'独立发送调用也遵守15秒最短间隔');
  await assert.rejects(timing.wait('private:1',()=>{throw Error('已暂停');}),/已暂停/);
  console.log('PASS 7秒时不能提前回复、15秒底线、补充消息重计时、跨工具发言间隔及等待中撤销');
  const notices=[],b=createExecutionBudget({onLimit:x=>notices.push(x)});
  for(let i=0;i<3;i++)assert.equal(b.beforeStep(1,{chatMaxRequests:3}),true);
  assert.equal(b.beforeStep(1,{chatMaxRequests:3}),false);assert.equal(notices.length,1);
  assert.equal(b.beforeStep(1,{chatMaxRequests:3}),false);assert.equal(notices.length,1);
  assert.equal(b.beforeStep(2,{chatMaxRequests:3}),true);
  const event={seq:1,type:'assistant/message',data:{turn:2,usage:{inputTokens:10,cacheReadTokens:100}}};b.event(event);b.event(event);
  assert.equal(b.snapshot().inputTokens,110);
  assert.equal(b.beforeStep(2,{chatMaxInputTokens:100}),false);
  assert.equal(b.beforeStep(3,{chatMaxRequests:1,taskMaxRequests:4},true),true);
  assert.equal(b.beforeStep(3,{chatMaxRequests:1,taskMaxRequests:4},true),true);
  assert.equal(b.allowRetry({maxModelFailures:2}),true);assert.equal(b.allowRetry({maxModelFailures:2}),false);
  const f=createExecutionBudget();f.beforeStep(1);
  for(let i=0;i<2;i++){f.event({seq:10+i*2,type:'tool/call',data:{turn:1,callId:String(i),name:'read'}});f.event({seq:11+i*2,type:'tool/result',data:{turn:1,message:{source:{callId:String(i)},isError:true}}});}
  assert.equal(f.beforeStep(1),false);
  console.log('PASS 每轮请求/输入预算、任务独立额度、重复事件幂等、模型及工具失败熔断');

  const file=path.join(temp,'images.json'),images=createImageObservations({file});
  const image={mimeType:'image/png',data:Buffer.from('fixture image').toString('base64')};
  const first=images.view('private:1','parent',image);assert.ok(first.data);
  assert.equal(images.view('private:1','parent',image).data,undefined);
  assert.ok(images.view('private:1','other',image).data,'新会话无描述时必须重新看图');
  assert.ok(images.view('private:2','parent',image).data,'不能跨会话复用私人描述');
  assert.equal(images.note('private:1','parent',[{hash:first.hash,summary:'未授权的旧收据'}]),0);
  assert.equal(images.note('private:1','other',[{hash:first.hash,summary:'一张猫的照片'}]),1);
  const reopened=createImageObservations({file});
  assert.equal(reopened.view('private:1','new',image).data,undefined);
  assert.match(reopened.view('private:1','new',image).text,/猫/);
  assert.ok(reopened.view('private:1','new',image,{force:true}).data);
  const pages=createTextArtifacts({dir:path.join(temp,'pages'),maxEntries:2});
  const page=pages.excerpt('abcdef',{maxChars:2});assert.equal(page.text,'ab');assert.equal(page.nextOffset,2);
  assert.equal(pages.read(page.textRef,{offset:2,maxChars:2}).text,'cd');
  assert.throws(()=>pages.read('../secret'));
  console.log('PASS 图片按会话复用、强制重读、描述持久化及跨会话隔离；长文本落盘和分段检索');

  // The baseline snapshot time/model must not reprice known historical requests.
  const ledger=createTokenLedger({file:path.join(temp,'ledger.jsonl')});
  const at=Date.parse('2026-03-02T10:00:00+08:00');
  const usage={inputTokens:100,cacheReadTokens:1000,outputTokens:20};
  ledger.ingestEvent({sessionId:'p',model:'deepseek-pro',event:{seq:5,time:at,type:'assistant/message',data:{turn:1,step:1,usage}}});
  ledger.ingestBaseline({sessionId:'p',model:'deepseek-flash',at:at+12*3600000,projection:{asOfSeq:10,values:{tokenUsage:usage}}});
  assert.equal(ledger.summary().totals.totalTokens,1120);
  assert.ok(Math.abs(ledger.summary().totals.cost-ledger.requests()[0].cost)<1e-12);
  const series=ledger.series({hours:24,at:at+3600000});
  assert.ok(Math.abs(series.totals.cost+series.offChartCost-ledger.summary().totals.cost)<1e-12);
  console.log('PASS 同一 Token 按真实请求模型/时间计价，累计、明细和时间轴金额一致');

  const h=await bridgeHarness({config:{socialV2:{compaction:{enabled:true,thresholdTokens:40000,hardThresholdTokens:80000,idleMs:300000},proactive:{enabled:false}}}});
  let server;
  try{
    h.setMode('reserved2');const key='private:123',sid=await h.ensureSession(key),st=h.getSocialV2State(key);
    const emit=(sessionId,time,input,step=1)=>h.recordSessionUsage(sessionId,{seq:step,time,type:'assistant/message',data:{turn:1,step,usage:{inputTokens:input,cacheReadTokens:0,outputTokens:1}}});
    emit(sid,Date.now()-10000,90000);
    h.tokenAudit.registerSession({sessionId:'child',parentSessionId:sid,key,category:'bili'});emit('child',Date.now(),1000);
    assert.equal(h.currentContextTokensV2(key),90000,'子会话不能掩盖父会话的长上下文');
    const original=h.api.callUnary;
    h.api.callUnary=async(name,args)=>name==='commands/execute'?{result:{ok:true,value:{commandId:'compact',result:{kind:'success',text:'done'}}}}:original(name,args);
    assert.equal(await h.prepareContextForWakeV2(key,st,'message'),true);
    assert.ok(st.contextCompactedSample);
    assert.equal(h.idleCompactDecisionV2(key,st),null,'同一采样不能反复压缩');
    server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    const call=async(route,body)=>{const r=await fetch(base+route,{method:body?'POST':'GET',headers:{'x-console-token':'fixture-console-token','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
    assert.equal((await call('/api/socialV2/config',{economy:{chatMaxRequests:5,biliMaxRequests:30}})).status,200);
    assert.equal((await call('/api/socialV2/config',{compaction:{thresholdTokens:90000,hardThresholdTokens:80000}})).status,400);
    const route='/api/socialV2/agent-context?sessionId='+sid;
    const c1=await call(route);assert.equal(c1.data.economy.chatMaxRequests,5);
    const c2=await call(route);assert.equal(c1.data.text,c2.data.text,'刷新不制造新版系统提示词');
    console.log('PASS 父会话上下文保护、压缩幂等、配置范围校验及稳定系统提示词');
  }finally{if(server)await new Promise(r=>server.close(r));await h.close();}
}finally{fs.rmSync(temp,{recursive:true,force:true});}

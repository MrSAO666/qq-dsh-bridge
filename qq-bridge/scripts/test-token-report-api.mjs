import assert from 'node:assert/strict';
import {bridgeHarness} from './audit-bridge-harness.mjs';
const h=await bridgeHarness();let server;
try{
 h.setMode('reserved2');const sid=await h.ensureSession('private:123');
 h.tokenAudit.registerSession({sessionId:'child',key:'private:123',category:'bili',runId:'example-run',parentSessionId:sid});
 const t=Date.parse('2026-11-03T12:00:00+08:00');
 const snapshot={projections:{asOfSeq:4,values:{modelSelection:{lastUsed:{model:'deepseek-flash',provider:'deepseek'}},tokenUsage:{uncachedInputTokens:10,outputTokens:2}}},records:[
  {seq:1,time:t,type:'model/selection',data:{model:'deepseek-flash',provider:'deepseek'}},
  {seq:2,time:t,type:'turn/start',data:{turn:1}},
  {seq:3,time:t,type:'assistant/message',data:{turn:1,step:1,usage:{inputTokens:10,outputTokens:2}}},
  {seq:4,time:t+1,type:'turn/end',data:{turn:1,reason:{kind:'completed'}}},
 ]};
 h.recordSessionSnapshot('child',snapshot,{rebuild:false});h.recordSessionSnapshot('child',snapshot,{rebuild:false});
 server=h.startConsoleServer();if(!server.listening)await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'x-console-token':'fixture-console-token'};
 const url=base+'/api/tokens/report?from=2026-11-03&to=2026-11-04&category=bili&view=tasks';
 const response=await fetch(url,{headers}),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.totals.tokens,12);assert.equal(data.entries.length,1);assert.equal(data.entries[0].key,'private:123');
 assert.equal(h.tokenLedger.summary().totals.totalTokens,12);
 assert.equal((await fetch(base+'/api/tokens/report?from=bad&to=bad',{headers})).status,400);
 const forbidden=await fetch(url,{headers:{...headers,'x-agent-token':'fixture-agent'}});assert.notEqual(forbidden.status,200);
 console.log('实际管理接口：子任务补记、快照重放不翻倍、日期筛选与会话主体拒绝访问通过。');
}finally{h.tokenChildObserver.dispose();if(server)await new Promise(r=>server.close(r));await h.close()}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { apply as applyContext } from '../plugins/qq-agent-context/index.js';

const card = '# 角色卡\n\n## 性格\n' + '这是完整的角色性格。'.repeat(180) + '\n卡片结尾标记';
const h = await bridgeHarness({
  config: { socialV2: { injectViaSystemPrompt: true, proactive: {enabled:false}, sticker:{enabled:false} } },
  files: { 'state/current-role.json': {role:'示例角色',mode:'active'}, 'roles/示例角色.md':card },
});
let server, dispose;
try {
  h.setMode('reserved2');
  const sid=await h.ensureSession('private:123');
  server=h.startConsoleServer();
  if(!server.listening) await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  async function api(route,body) {
    const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'x-console-token':'fixture-console-token','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,data:await r.json()};
  }
  const saved=await api('/api/socialV2/config',{replyCheck:{windowMs:120000},send:{burstIntervalMinMs:15000,burstIntervalMaxMs:60000,maxGapMs:10000}});
  assert.equal(saved.status,200);assert.equal(saved.data.config.replyCheck.windowMs,120000);
  const st=h.getSocialV2State('private:123');
  h.scheduleReplyCheckV2('private:123');
  assert.ok(st.replyWindowUntil-Date.now()>119000);
  h.armReplyWindowV2('private:123');assert.ok(st.replyWindowUntil-Date.now()>119000);
  const gaps=h.computeGapsV2(Array(50).fill('完整短句'),'auto',null,null,{...h.cfg.socialV2.send,longGapProbability:0});
  assert.ok(gaps.every(x=>x>=15000&&x<=60000));assert.ok(gaps.some(x=>x>15000));
  assert.equal((await api('/api/socialV2/config',{replyCheck:{windowMs:1000}})).status,400);
  assert.equal(h.cfg.socialV2.replyCheck.windowMs,120000);
  const context=await api('/api/socialV2/agent-context?sessionId='+sid);
  assert.equal(context.status,200);assert.equal(context.data.role.name,'示例角色');
  assert.ok(context.data.role.injectedChars>1200);assert.ok(context.data.text.includes('卡片结尾标记'));
  assert.ok(!h.buildWakePromptV2('private:123','question').includes('卡片结尾标记'),'角色正文只在系统提示词出现');
  const handlers={},sections=[];
  const ctx={agents:{list:()=>[]},on:(name,fn)=>{handlers[name]=fn},effect:fn=>{dispose=fn()}};
  const agent={id:sid,ctx:{inject:(deps,fn)=>{
    fn({systemPrompt:{section:s=>sections.push(s)}});
    return {dispose(){}};
  }}};
  fs.writeFileSync(path.join(h.temp,'state/console-token'),'fixture-console-token');
  applyContext(ctx,{bridgeUrl:base,tokenFile:path.join(h.temp,'state/console-token')});
  await handlers['agent/created']({agent});
  assert.equal(sections.length,1);assert.equal(sections[0].name,'qq:session-context');
  assert.ok(sections[0].text().includes('卡片结尾标记'),'真正注册的系统提示词段包含长角色卡结尾');
  await handlers['agent/created']({agent:{...agent,id:'unknown'}});assert.equal(sections.length,1,'未知会话不得读取卡片与上下文');
  console.log('真实配置路由、120秒回复窗口、15～60秒间隔、长人物卡系统注入与会话隔离通过。');
} finally {
  dispose?.();
  if(server) await new Promise(resolve=>server.close(resolve));
  await h.close();
}

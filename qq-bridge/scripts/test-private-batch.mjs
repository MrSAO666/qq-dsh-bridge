import assert from 'node:assert/strict';
import { bridgeHarness } from './audit-bridge-harness.mjs';
const h = await bridgeHarness({config:{socialV2:{wake:{batchWindowMsPrivate:1000},context:{inlineWakeMessages:true}}}});
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
try {
  h.setMode('reserved2');
  const key='private:123';
  h.appendSocialV2Message(key,'user','hello','hello',false,true,'1',[],123,[]);
  h.scheduleWakeV2(key,'private');
  const st=h.getSocialV2State(key);
  assert.ok(st.pendingWakeTimer);
  const first=st.pendingWakeTimer;
  await sleep(700);
  h.appendSocialV2Message(key,'user','[image]','[image]',false,true,'2',[{kind:'image',url:'https://example.invalid/image.png'}],123,[]);
  assert.notEqual(st.pendingWakeTimer,first,'image must extend pending batch');
  await sleep(450);
  assert.ok(st.pendingWakeTimer,'must still wait after original deadline');
  const snapshot=h.buildWakeSnapshotV2(key);
  assert.equal(snapshot.messages.length,2);
  assert.equal(snapshot.messages[1].messageId,'2');
  assert.equal(snapshot.messages[1].hasMedia,true);
  assert.equal(st.pendingBatchWindowMs,1000);
  console.log('PASS rolling private window combines text and image');
} finally { await h.close(); }

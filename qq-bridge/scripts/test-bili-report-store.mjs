import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { createBiliReportStore } from '../src/bili-report-store.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bili-report-')),file=path.join(dir,'reports.json');let online=false,calls=0;
try {
  const store=createBiliReportStore({file,canSend:async()=>online,send:async()=>{calls++;return 'sent'}});
  store.enqueue({id:'a',text:'视频摘要'});await store.flush();assert.equal(calls,0);
  online=true;await store.flush();assert.equal(calls,1);await store.flush();assert.equal(calls,1);assert.equal(store.snapshot().items[0].status,'sent');
  const ambiguous=createBiliReportStore({file,canSend:async()=>true,send:async()=>{throw Error('timeout')}});
  ambiguous.enqueue({id:'b',text:'第二条'});await ambiguous.flush();assert.equal(ambiguous.snapshot().items[1].status,'uncertain');
  let recovered=JSON.parse(fs.readFileSync(file));recovered.items.push({id:'c',text:'第三条',status:'sending'});fs.writeFileSync(file,JSON.stringify(recovered));
  const restarted=createBiliReportStore({file,canSend:async()=>true,send:async()=>{throw Error('must not retry')}});
  assert.equal(restarted.snapshot().items[2].status,'uncertain');await restarted.flush();
  console.log('B站汇报队列测试通过');
}finally{fs.rmSync(dir,{recursive:true,force:true})}

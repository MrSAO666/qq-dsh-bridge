import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyBiliQueue, enqueueBiliReport, beginBiliDelivery, resolveBiliDelivery, recoverBiliDelivery } from './bili-delivery-queue.mjs';

export function createBiliReportStore({ file, canSend, send }) {
  let state;
  try { state = recoverBiliDelivery(JSON.parse(fs.readFileSync(file,'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; state = emptyBiliQueue(); }
  let sending = false;
  function persist(next) {
    const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const tmp=path.join(dir,`.reports.${process.pid}.${randomUUID()}.tmp`);
    try { fs.writeFileSync(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file); }
    catch(e) { try{fs.unlinkSync(tmp)}catch{} throw e; }
    state=next;
  }
  // Commit recovered uncertain states before any new delivery.
  persist(state);
  function enqueue({id,text,target}) { persist(enqueueBiliReport(state,{id,text,target})); }
  async function flush() {
    if (sending || !await canSend()) return;
    const item=state.items.find(x=>x.status==='pending');if(!item)return;
    sending=true;
    try {
      persist(beginBiliDelivery(state,item.id));
      let outcome='uncertain';
      try { outcome=await send(item.text,item.target); } catch { /* delivery may have reached QQ */ }
      if (!['sent','not_sent','uncertain'].includes(outcome)) outcome='uncertain';
      persist(resolveBiliDelivery(state,item.id,outcome));
    } finally { sending=false; }
  }
  return { enqueue, flush, snapshot:()=>structuredClone(state) };
}

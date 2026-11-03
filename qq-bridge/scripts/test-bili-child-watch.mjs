import assert from 'node:assert/strict';
import { watchBiliChild } from '../src/bili-child-watch.mjs';
class Socket {
  constructor() { this.readyState=0; this.handlers={}; this.sent=[]; }
  addEventListener(name, fn) { this.handlers[name]=fn; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  emit(name, value={}) { this.handlers[name]?.(value); }
  close() { this.readyState=3; this.emit('close'); }
}
let socket; const seen=[];
const watcher=watchBiliChild({api:{baseUrl:'http://localhost:3080',ensureAuth:async()=> 'cookie'},parentSessionId:'parent',runId:'abc',socketFactory:()=>socket=new Socket(),onStart:x=>seen.push(['start',x]),onEnd:x=>seen.push(['end',x]),onError:e=>{throw e}});
await new Promise(resolve=>setTimeout(resolve,0));
socket.readyState=1;socket.emit('open');
const parent=socket.sent[0].streamId;
socket.emit('message',{data:JSON.stringify({type:'item',streamId:parent,value:{type:'snapshot',records:[]}})});
await watcher.ready;
socket.emit('message',{data:JSON.stringify({type:'item',streamId:parent,value:{type:'event',event:{type:'subagent/catalog',data:{childId:'other',label:'wrong',mode:'continuable'}}}})});
assert.equal(socket.sent.length,1);
socket.emit('message',{data:JSON.stringify({type:'item',streamId:parent,value:{type:'event',event:{type:'subagent/catalog',data:{childId:'child',label:'bili-abc',mode:'continuable'}}}})});
const child=socket.sent[1].streamId;
socket.emit('message',{data:JSON.stringify({type:'item',streamId:child,value:{type:'snapshot',records:[{event:{seq:1,time:1000,type:'turn/start'}},{event:{seq:2,time:1100,type:'assistant/message',data:{message:{content:[{type:'reasoning',text:'secret'},{type:'text',text:'摘要'}]}}}},{event:{seq:3,time:1200,type:'turn/end',data:{reason:{kind:'completed'}}}}]}})});
assert.deepEqual(seen,[['start',{childId:'child',startedAt:1000}],['end',{childId:'child',endedAt:1200,text:'摘要',reason:'completed'}]]);
assert.equal(socket.readyState,3);
console.log('B 站子任务监听测试通过');

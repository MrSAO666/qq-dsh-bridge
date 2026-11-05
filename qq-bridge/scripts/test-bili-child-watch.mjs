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

// The model may put the unique run label in the prompt instead of description.
let socket2; const linked=[];
const w2=watchBiliChild({api:{baseUrl:'http://localhost',ensureAuth:async()=>''},parentSessionId:'parent',runId:'def',socketFactory:()=>socket2=new Socket(),onStart:x=>linked.push(x),onEnd:()=>{},onError:e=>{throw e}});
await new Promise(resolve=>setTimeout(resolve,0));socket2.readyState=1;socket2.emit('open');
const p2=socket2.sent[0].streamId;
const emit=e=>socket2.emit('message',{data:JSON.stringify({type:'item',streamId:p2,value:{type:'event',event:e}})});
socket2.emit('message',{data:JSON.stringify({type:'item',streamId:p2,value:{type:'snapshot',records:[]}})});await w2.ready;
emit({type:'tool/call',data:{name:'subagent',callId:'call-1',arguments:JSON.stringify({description:'browse',prompt:'bili-def'})}});
emit({type:'subagent/catalog',data:{childId:'35b9c7af-9212-4161-bc44-7f898b985633',label:'browse',mode:'continuable'}});
assert.equal(socket2.sent.length,1);
emit({type:'tool/result',data:{message:{toolCallId:'different-call',content:[{type:'text',text:'started subagent 35b9c7af-9212-4161-bc44-7f898b985633'}]}}});
assert.equal(socket2.sent.length,1);
emit({type:'tool/result',data:{message:{toolCallId:'call-1',content:[{type:'text',text:'started subagent 35b9c7af-9212-4161-bc44-7f898b985633'}]}}});
assert.equal(socket2.sent.length,2);w2.stop();

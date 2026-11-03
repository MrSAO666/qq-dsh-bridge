import assert from 'node:assert/strict';
import {createTokenChildObserver} from '../src/token-child-watch.mjs';
class Socket { constructor(){this.readyState=0;this.handlers={};this.sent=[]}addEventListener(n,f){this.handlers[n]=f}send(s){this.sent.push(JSON.parse(s))}emit(n,x){this.handlers[n]?.(x)}close(){this.readyState=3;this.emit('close')} }
const sessions=new Map([['parent',{key:'private:123',category:'chat'}]]),snapshots=[],events=[],sockets=[];
const audit={sessionMeta:id=>sessions.get(id),registerSession:r=>sessions.set(r.sessionId,{...sessions.get(r.sessionId),...r})};
const observer=createTokenChildObserver({api:{baseUrl:'http://localhost:3080',ensureAuth:async()=> 'fixture'},audit,onSnapshot:(...x)=>snapshots.push(x),onEvent:(...x)=>events.push(x),socketFactory:()=>{const s=new Socket();sockets.push(s);return s}});
try{
 observer.observeParent('parent',{projections:{values:{subagentCatalog:[{id:'child',mode:'continuable',label:'bili-3f945bcb-7b8d-4e90-8c9b-5dda79607f60'}]}}},true);
 await new Promise(r=>setTimeout(r,0));const s=sockets[0];s.readyState=1;s.emit('open');
 assert.equal(s.sent[0].payload.args.request.address.kind,'subagent');
 assert.equal(sessions.get('child').category,'bili');assert.equal(sessions.get('child').key,'private:123');
 const streamId=s.sent[0].streamId;
 s.emit('message',{data:JSON.stringify({type:'item',streamId,value:{type:'snapshot',projections:{values:{agentPreset:'qq-bili-worker'}},records:[{type:'turn/start',seq:1,time:1}]}})});
 s.emit('message',{data:JSON.stringify({type:'item',streamId,value:{type:'event',event:{type:'assistant/message',seq:2,time:2,data:{usage:{inputTokens:1}}}}})});
 s.emit('message',{data:JSON.stringify({type:'item',streamId,value:{type:'event',event:{type:'turn/end',seq:3,time:3}}})});
 assert.equal(snapshots.length,1);assert.equal(events.length,2);assert.equal(s.readyState,3);
 observer.observeParent('parent',{projections:{values:{subagentCatalog:[{id:'child',mode:'continuable',label:'bili-3f945bcb-7b8d-4e90-8c9b-5dda79607f60'}]}}},true);
 assert.equal(sockets.length,1);
 console.log('历史子任务发现、显式子会话寻址、实时用量接入和结束释放通过。');
}finally{observer.dispose()}

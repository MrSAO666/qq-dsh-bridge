import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syncVideoCookies} from '../plugins/qq-agent-presets/video-auth.mjs';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { toolGuardReason,MODES } from '../plugins/qq-agent-presets/qq-tool-restrict.mjs';
const args={input:'https://www.bilibili.com/video/BV1BK411Q7ys',from:0,to:180,maxFrames:24,maxSheets:2,budget:360000,transcript:'off'};
for(const mode of [MODES.OPEN,MODES.BILI]) {
 assert.equal(toolGuardReason(mode,{name:'video_storyboard',arguments:args}),undefined);
 assert.ok(toolGuardReason(mode,{name:'video_storyboard',arguments:{...args,to:301}}));
 assert.ok(toolGuardReason(mode,{name:'video_storyboard',arguments:{...args,maxSheets:0}}));
 assert.ok(toolGuardReason(mode,{name:'video_storyboard',arguments:{...args,maxFrames:0}}));
 assert.ok(toolGuardReason(mode,{name:'video_storyboard',arguments:{...args,budget:1690000}}));
}
for(const mode of [MODES.STRICT,MODES.READONLY]) {
 assert.ok(toolGuardReason(mode,{name:'video_probe',arguments:args}));
 assert.ok(toolGuardReason(mode,{name:'video_storyboard',arguments:args}));
}
for(const input of ['/root/.dsh/config.json','https://127.0.0.1/video/BV1BK411Q7ys','https://www.bilibili.com.evil.test/video/BV1BK411Q7ys']) assert.ok(toolGuardReason(MODES.BILI,{name:'video_probe',arguments:{input}}));
assert.ok(toolGuardReason(MODES.BILI,{name:'video_storyboard',arguments:{...args,cookies:'/root/secret'}}));
assert.ok(toolGuardReason(MODES.BILI,{name:'video_storyboard_settings',arguments:{}}));
console.log('PASS 视频权限隔离、300秒/48帧/2图预算、B站URL与敏感参数防护');
const authDir=fs.mkdtempSync(path.join(os.tmpdir(),'video-auth-test-'));
try {
 const target=path.join(authDir,'bili-video-cookies.txt'),cred=path.join(authDir,'bili_credential.json');
 fs.writeFileSync(path.join(authDir,'video.json'),JSON.stringify({cookies:target}));
 fs.writeFileSync(cred,JSON.stringify({sessdata:'first-fixture',bili_jct:'csrf-fixture',dedeuserid:'123'}));
 assert.equal(syncVideoCookies({dataDir:authDir,home:authDir}),true);
 assert.ok(fs.readFileSync(target,'utf8').includes('first-fixture'));
 fs.writeFileSync(cred,JSON.stringify({sessdata:'second-fixture',bili_jct:'csrf-fixture',dedeuserid:'123'}));
 syncVideoCookies({dataDir:authDir,home:authDir});assert.ok(fs.readFileSync(target,'utf8').includes('second-fixture'));
 fs.unlinkSync(cred);assert.throws(()=>syncVideoCookies({dataDir:authDir,home:authDir}));assert.ok(!fs.existsSync(target));
 console.log('PASS 视频登录态随已有B站凭据更新，凭据删除时拒绝复用旧副本');
}finally{fs.rmSync(authDir,{recursive:true,force:true});}
const h=await bridgeHarness();let server;
try {
 h.setMode('reserved2');
 const media=h.extractMediaFromSegments([{type:'video',data:{file:'gateway.mp4',url:'https://multimedia.nt.qq.com.cn/video.mp4'}}]);
 assert.equal(media[0].kind,'video');
 h.appendSocialV2Message('private:123','owner','[视频]','[视频]',false,true,'881',media,123);
 assert.equal(h.getSocialV2State('private:123').recentMessages.at(-1).media[0].kind,'video');
 const images=await h.fetchMediaData(media);assert.equal(images.length,0);assert.equal(h.calls.images.length,0);
 server=h.startConsoleServer();await new Promise(r=>server.listening?r():server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/socialV2/message-detail?key=private:123&messageId=1',{headers:{'x-console-token':'fixture-console-token'}});
 const result=await res.json();assert.equal(result.info.videos[0].url,media[0].url);
 h.appendSocialV2Message('group:456','friend','[视频]','[视频]',false,false,'882',media,123);
 const group=await (await fetch(base+'/api/socialV2/message-detail?key=group:456&messageId=1',{headers:{'x-console-token':'fixture-console-token'}})).json();
 assert.equal(group.info.videos,undefined);
 assert.equal(h.calls.sent.length,0);
 console.log('PASS QQ视频入站保留、避免图片误解码、仅主人详情返回链接；未发送消息');
} finally {if(server)await new Promise(r=>server.close(r));await h.close();}

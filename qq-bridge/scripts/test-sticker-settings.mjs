import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStickerGateway} from '../../dsh-plugins/dsh-thinking-zh/lib/features/sticker-gateway.js';
import {createStickerSettings} from '../../dsh-plugins/dsh-thinking-zh/lib/features/sticker-settings.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sticker-settings-'));const content=Buffer.from(JSON.stringify({schema:'sticker-kit/1',stickers:[]}));let refreshes=0;
const entry={id:'a/b',hash:'aabbccddeeff',name:'one'};
const kit={site:'https://kiriyuki.com',all:async()=>[entry],search:async()=>[{sticker:entry}],url:()=> 'https://kiriyuki.com/a.gif',fetch:async()=>content,refresh:async()=>{refreshes++}};
const request=async()=>({ok:true,headers:{get:()=>String(content.length)},body:(async function*(){yield content})()});
try{
 const settings=createStickerSettings({directory:dir,getKit:()=>kit,request});const g=createStickerGateway(()=>kit,{isEnabled:()=>settings.read().enabled});
 assert.equal((await settings.status()).enabled,true);assert.equal((await g.search('a')).length,1);
 settings.setEnabled(false);assert.equal((await g.search('a')).length,0);assert.equal(await g.resolve('nekowhale:a/b'),null);
 assert.equal(createStickerSettings({directory:dir,getKit:()=>kit,request}).read().enabled,false);
 const updated=await settings.update();assert.ok(updated.lastChecked);assert.equal(refreshes,1);assert.equal(updated.enabled,false);
 settings.setEnabled(true);assert.ok(await g.resolve('nekowhale:a/b'));
 const bad=createStickerSettings({directory:dir,getKit:()=>({...kit,fetch:async()=>Buffer.from('{}')}),request});await assert.rejects(()=>bad.update(),/未确认/);
 assert.equal(settings.read().enabled,true);
 console.log('knowledge source toggle, persistence, refresh and failure handling passed');
}finally{fs.rmSync(dir,{recursive:true,force:true})}

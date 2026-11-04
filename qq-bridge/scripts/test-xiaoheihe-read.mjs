import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createXiaoheiheReader } from '../src/xiaoheihe-read.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xhh-read-'));
try {
 const client={feed:async()=>({links:[{linkid:42,title:'<b>AI</b>'},{linkid:'bad',title:'ignored'}]}),post:async()=>({link:{linkid:42,title:'游戏',text:'<p>内容</p>'},comments:[{comment:[{text:'好'}]}]})};
 const reader=createXiaoheiheReader({client,directory,now:()=>123});
 assert.deepEqual((await reader.feed()).links,[{postId:'42',title:'AI'}]);
 const post=await reader.post('42'); assert.equal(post.body,'内容'); assert.equal(post.comments[0].text,'好'); assert.equal(post.url,'https://www.xiaoheihe.cn/app/bbs/link/42');
 assert.equal(fs.readFileSync(path.join(directory,'events.jsonl'),'utf8').trim().split('\n').length,2);
 await assert.rejects(()=>reader.post('43'),/指定帖子/);
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
console.log('小黑盒帖子读取及日志测试通过');

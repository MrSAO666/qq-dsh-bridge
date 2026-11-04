import fs from 'node:fs';
import path from 'node:path';
import { forumText } from './xiaoheihe-forum-text.mjs';

export function createXiaoheiheReader({ client, directory, now = Date.now }) {
  if (!client || !path.isAbsolute(directory)) throw new Error('小黑盒读取器配置无效');
  const log = (action, result, postId = '', title = '') => {
    fs.mkdirSync(directory, { recursive:true, mode:0o700 });
    fs.appendFileSync(path.join(directory,'events.jsonl'), JSON.stringify({at:now(),action,result,postId,title:forumText(title,160),url:postId ? `https://www.xiaoheihe.cn/app/bbs/link/${postId}` : ''})+'\n', {mode:0o600});
  };
  async function feed(offset=0) {
    try {
      const data=await client.feed(offset);
      const links=(Array.isArray(data.links)?data.links:[]).slice(0,20).filter(x=>/^\d{1,24}$/.test(String(x?.linkid||''))).map(x=>({postId:String(x.linkid),title:forumText(x.title,300)}));
      log('推荐帖子','完成'); return {links};
    } catch(e) { log('推荐帖子','失败'); throw e; }
  }
  async function post(postId) {
    try {
      const data=await client.post(postId), p=data.link;
      if (!p || String(p.linkid)!==String(postId)) throw new Error('未取得指定帖子');
      const groups=Array.isArray(data.comments)?data.comments:Array.isArray(data.comment)?data.comment:[];
      const comments=groups.flatMap(g=>Array.isArray(g.comment)?g.comment:[g]).slice(0,15).map(c=>({text:forumText(c.text,500)})).filter(c=>c.text);
      const result={postId:String(postId),title:forumText(p.title,400),body:forumText(p.text||p.description,8000),comments,url:`https://www.xiaoheihe.cn/app/bbs/link/${postId}`};
      log('读取帖子','完成',result.postId,result.title); return result;
    } catch(e) { log('读取帖子','失败',String(postId)); throw e; }
  }
  return {feed,post};
}

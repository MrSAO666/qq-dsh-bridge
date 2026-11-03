import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Bounded public-source excerpts. Full text stays on disk, not in model history.
export function createTextArtifacts({dir,maxEntries=100,maxBytes=2000000,ttlMs=7*86400000,now=Date.now}) {
  function put(text) {
    const body=String(text).slice(0,200000),ref=crypto.createHash('sha256').update(body).digest('hex');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const file=path.join(dir,ref+'.txt');
    if(!fs.existsSync(file))fs.writeFileSync(file,body,{mode:0o600});
    fs.utimesSync(file,new Date(now()),new Date(now()));
    const files=fs.readdirSync(dir).filter(f=>/^[a-f0-9]{64}\.txt$/.test(f)).map(f=>({f,s:fs.statSync(path.join(dir,f))})).sort((a,b)=>b.s.mtimeMs-a.s.mtimeMs);
    let bytes=0;
    for(let i=0;i<files.length;i++){const x=files[i];bytes+=x.s.size;if(i>=maxEntries||bytes>maxBytes||now()-x.s.mtimeMs>ttlMs){if(x.f!==ref+'.txt')fs.unlinkSync(path.join(dir,x.f));}}
    return ref;
  }
  function excerpt(text,{offset=0,maxChars=3000}={}) {
    const body=String(text),start=Math.max(0,Math.floor(Number(offset)||0)),count=Math.min(6000,Math.max(1,Math.floor(Number(maxChars)||3000)));
    const ref=put(body);
    return {text:body.slice(start,start+count),textRef:ref,offset:start,totalChars:body.length,truncated:start>0||start+count<body.length,nextOffset:start+count<body.length?start+count:null};
  }
  function read(ref,opts={}){
    if(!/^[a-f0-9]{64}$/.test(ref))throw Error('文本引用无效');
    return excerpt(fs.readFileSync(path.join(dir,ref+'.txt'),'utf8'),opts);
  }
  return {excerpt,read};
}

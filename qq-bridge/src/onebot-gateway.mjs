import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

const DEFAULT_ALLOWED=['get_login_info','set_qq_profile','set_self_longnick','set_qq_avatar','add_custom_face'];
const NAME=/^[A-Za-z_.][A-Za-z0-9_.]{0,79}$/;
const SECRET=/(cookie|token|credential|password|passwd|secret|skey|csrf|ticket|qrcode|qr_code|auth|session|login_key)/i;
const FILE_KEY=/(^|_)(file|path|url|image|video|audio|directory|folder)(_|$)/i;
const isObject=x=>x!==null && typeof x==='object' && !Array.isArray(x);
// Descriptions supplement gaps in the live upstream catalog; an upstream
// description always wins so syncs can pick up changes in later versions.
const SUMMARY_FALLBACK=Object.freeze({
  can_send_image:'查询当前账号是否支持发送图片',
  can_send_record:'查询当前账号是否支持发送语音',
  cancel_group_album_media_like:'取消对指定群相册媒体的点赞',
  do_group_album_comment:'评论指定群相册媒体',
  get_group_album_list:'获取群相册列表',
  get_group_album_media_list:'获取指定群相册的媒体列表',
  get_login_info:'获取当前登录账号的 QQ 号和昵称',
  get_qun_album_list:'获取群相册列表（支持翻页参数）',
  get_status:'获取 OneBot 连接和运行状态',
  get_version_info:'获取 OneBot 实现和协议版本信息',
  set_group_album_media_like:'给指定群相册媒体点赞',
  upload_image_to_qun_album:'上传图片到指定群相册（网关当前不支持通用文件参数）',
});
const UNSUPPORTED=new Set(['create_collection','set_group_anonymous','set_group_anonymous_ban','set_restart']);

export function createOnebotGateway({directory,catalogFile,request,now=Date.now}) {
  if(!path.isAbsolute(directory)||!path.isAbsolute(catalogFile)||typeof request!=='function')throw Error('网关配置无效');
  const configFile=path.join(directory,'config.json'),logFile=path.join(directory,'audit.jsonl'),localCatalog=path.join(directory,'catalog.json');
  function rawCatalog(){
    let raw;try{raw=JSON.parse(fs.readFileSync(fs.existsSync(localCatalog)?localCatalog:catalogFile,'utf8'))}catch{return []}
    if(isObject(raw))raw=raw.actions;
    return Array.isArray(raw)?raw:[];
  }
  function catalog(){
    return rawCatalog().filter(x=>isObject(x)&&typeof x.name==='string'&&NAME.test(x.name)&&!SECRET.test(x.name))
      .slice(0,500).map(x=>{
        const localSegments=x.name==='.get_word_slices' && /未实现|不支持/.test(String(x.summary||''));
        return {name:x.name,readOnly:localSegments||x.readOnly===true,summary:localSegments?'本地中文分词（Intl.Segmenter，结果与 QQ 原生分词可能不同）':String(x.summary||SUMMARY_FALLBACK[x.name]||'').slice(0,250),
          params:localSegments?['content']:Array.isArray(x.params)?x.params.map(p=>typeof p==='string'?p:p?.name).filter(p=>typeof p==='string'&&NAME.test(p)).slice(0,40):[],
          paramDetails:localSegments?[{name:'content',type:'string',required:true,desc:'要分词的文本',schema:{type:'string'}}]:Array.isArray(x.params)?x.params.filter(isObject).slice(0,40).map(p=>({name:p.name,type:typeof p.type==='string'?p.type.slice(0,50):'',required:p.required===true,desc:typeof p.desc==='string'?p.desc.slice(0,300):'',schema:isObject(p.schema)?p.schema:null})):[],localSegments,
          unsupported:UNSUPPORTED.has(x.name)&&/未实现|不支持/.test(String(x.summary||''))};
      });
  }
  async function syncCatalog({url,password,totp},fetchImpl=globalThis.fetch){
    let target;try{target=new URL(url)}catch{throw Error('WebUI 地址无效')}
    const local=new Set(['127.0.0.1','localhost','::1',...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(x=>x.address)]);
    if(!['http:','https:'].includes(target.protocol)||!local.has(target.hostname.replace(/^\[|\]$/g,''))||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('只允许本机监听的 SnowLuma WebUI 地址');
    if(typeof password!=='string'||!password||password.length>512||typeof totp!=='string'||totp.length>32)throw Error('登录信息无效');
    const base=target.origin;let session='';const previous=new Set(rawCatalog().map(x=>x.name));
    try{
      let r=await fetchImpl(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password,...(totp?{totp}:{})}),redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error('WebUI 登录失败');let data=await r.json();
      if(data?.needsTotp)throw Error('WebUI 需要二次验证码');
      if(!data?.success||typeof data.token!=='string'||!data.token||data.mustChangePassword)throw Error('WebUI 登录失败或需要先修改初始密码');
      session=data.token;
      r=await fetchImpl(base+'/api/debug/actions',{headers:{'x-snowluma-token':session},redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error('无法读取 SnowLuma 接口目录');const text=await r.text();if(Buffer.byteLength(text)>4*1024*1024)throw Error('接口目录过大');
      data=JSON.parse(text);if(!Array.isArray(data.actions)||data.actions.length<1||data.actions.length>500)throw Error('接口目录无效');
      if(data.actions.some(x=>!isObject(x)||typeof x.name!=='string'||!NAME.test(x.name)||!Array.isArray(x.params)))throw Error('接口目录格式无效');
      fs.mkdirSync(directory,{recursive:true,mode:0o700});const tmp=localCatalog+'.'+crypto.randomUUID()+'.tmp';
      try{fs.writeFileSync(tmp,JSON.stringify({actions:data.actions}),{mode:0o600,flag:'wx'});fs.renameSync(tmp,localCatalog)}finally{try{fs.unlinkSync(tmp)}catch{}}
      const current=new Set(data.actions.map(x=>x.name));
      return {total:data.actions.length,available:catalog().length,added:[...current].filter(x=>!previous.has(x)).length,removed:[...previous].filter(x=>!current.has(x)).length};
    }finally{if(session)try{await fetchImpl(base+'/api/logout',{method:'POST',headers:{'x-snowluma-token':session},redirect:'error',signal:AbortSignal.timeout(5000)})}catch{}}
  }
  function config(){
    try{const c=JSON.parse(fs.readFileSync(configFile,'utf8'));if(!isObject(c)||typeof c.enabled!=='boolean'||!Array.isArray(c.allowed)||c.allowed.some(x=>typeof x!=='string'||!NAME.test(x)||SECRET.test(x)))throw Error();return {enabled:c.enabled,allowed:[...new Set(c.allowed)]};}
    catch(e){if(e.code==='ENOENT')return {enabled:true,allowed:[...DEFAULT_ALLOWED]};throw Error('网关配置无效，已停止调用');}
  }
  function saveConfig(raw){
    if(!isObject(raw)||typeof raw.enabled!=='boolean'||!Array.isArray(raw.allowed)||raw.allowed.length>500)throw Error('网关设置无效');
    const known=new Set(catalog().map(x=>x.name));
    const allowed=[...new Set(raw.allowed)];
    if(allowed.some(x=>typeof x!=='string'||!known.has(x)||SECRET.test(x)))throw Error('允许列表含未知或受限接口');
    const next={enabled:raw.enabled,allowed};fs.mkdirSync(directory,{recursive:true,mode:0o700});const tmp=configFile+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,configFile)}finally{try{fs.unlinkSync(tmp)}catch{}}
    return next;
  }
  function list(query=''){
    const c=config(),q=String(query).trim().toLowerCase().slice(0,100),terms=q.split(/[\s,，、/]+/).filter(Boolean);
    if(/昵称|名字|资料/.test(q))terms.push('set_qq_profile');
    if(/签名|长签/.test(q))terms.push('set_self_longnick','set_qq_profile');
    if(/头像/.test(q))terms.push('set_qq_avatar');
    if(/收藏.*表情|收藏.*图片/.test(q))terms.push('add_custom_face');
    return catalog().filter(x=>!q||terms.some(t=>(x.name+' '+x.summary+' '+x.params.join(' ')).toLowerCase().includes(t)))
      .map(x=>({...x,allowed:c.enabled&&c.allowed.includes(x.name),schemaComplete:x.params.length===x.paramDetails.length}));
  }
  function image(value){
    if(typeof value!=='string'||!/^base64:\/\/[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('图片只能使用 base64:// 格式');
    const b=Buffer.from(value.slice(9),'base64');
    if(!b.length||b.length>2*1024*1024)throw Error('图片大小无效（最多 2MB）');
    const png=b.length>8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=b.length>3&&b[0]===255&&b[1]===216&&b[2]===255;
    const gif=b.length>6&&['GIF87a','GIF89a'].includes(b.subarray(0,6).toString());
    if(!png&&!jpg&&!gif)throw Error('仅支持 PNG、JPEG、GIF 图片');
  }
  function validateArgs(action,args,meta){
    if(!isObject(args)||Buffer.byteLength(JSON.stringify(args))>3000000)throw Error('参数必须是大小受限的 JSON 对象');
    if(Object.keys(args).some(k=>!meta.params.includes(k)||SECRET.test(k)))throw Error('包含目录中没有的参数或敏感参数');
    let count=0;
    function walk(v,depth,key=''){
      if(++count>300||depth>5)throw Error('参数结构过于复杂');
      if(SECRET.test(key)||['__proto__','prototype','constructor'].includes(key))throw Error('敏感或不安全的参数不可通过网关传递');
      if(FILE_KEY.test(key)){
        if(depth===1&&key==='file'&&['set_qq_avatar','add_custom_face'].includes(action)){image(v);return;}
        throw Error('此接口的文件或链接参数暂不支持通用调用');
      }
      if(v===null||typeof v==='boolean')return;
      if(typeof v==='number'){if(!Number.isFinite(v)||!Number.isSafeInteger(v))throw Error('数字参数无效');return;}
      if(typeof v==='string'){if(v.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))throw Error('文本参数无效');return;}
      if(Array.isArray(v)){if(v.length>50)throw Error('数组过长');for(const x of v)walk(x,depth+1);return;}
      if(!isObject(v)||Object.keys(v).length>40)throw Error('参数类型无效');
      for(const [k,x] of Object.entries(v))walk(x,depth+1,k);
    }
    for(const [k,v] of Object.entries(args))walk(v,1,k);
    for(const p of meta.paramDetails||[]){
      if(p.required&&!Object.hasOwn(args,p.name))throw Error('缺少必填参数：'+p.name);
      if(!Object.hasOwn(args,p.name)||!isObject(p.schema))continue;
      const v=args[p.name],s=p.schema;
      if(s.type==='string'&&typeof v!=='string')throw Error('参数类型错误：'+p.name);
      if(s.type==='boolean'&&typeof v!=='boolean')throw Error('参数类型错误：'+p.name);
      if((s.type==='number'||s.type==='integer')&&(typeof v!=='number'||(s.type==='integer'&&!Number.isInteger(v))))throw Error('参数类型错误：'+p.name);
      if(s.type==='array'&&!Array.isArray(v))throw Error('参数类型错误：'+p.name);
      if(s.type==='object'&&!isObject(v))throw Error('参数类型错误：'+p.name);
      if(Array.isArray(s.enum)&&!s.enum.includes(v))throw Error('参数值不在允许范围：'+p.name);
      if(typeof v==='number'&&((Number.isFinite(s.minimum)&&v<s.minimum)||(Number.isFinite(s.maximum)&&v>s.maximum)))throw Error('参数数值超出范围：'+p.name);
    }
    if(action==='set_qq_profile'){
      if(!Object.keys(args).length||Object.entries(args).some(([k,x])=>k==='sex'?!Number.isInteger(x)||x<0||x>2:typeof x!=='string'||x.length>200))throw Error('资料参数无效');
    }
    if(action==='set_self_longnick' && (Object.keys(args).length!==1||typeof (args.longNick??args.long_nick)!=='string'||(args.longNick??args.long_nick).length>200))throw Error('签名必须为不超过 200 字的文本');
    if(['set_qq_avatar','add_custom_face'].includes(action)&&!args.file)throw Error('需要提供图片');
    return args;
  }
  function sanitize(value,depth=0){
    if(depth>5)return '[内容已截断]';
    if(value===null||typeof value==='boolean'||typeof value==='number')return value;
    if(typeof value==='string')return value.slice(0,2000);
    if(Array.isArray(value))return value.slice(0,50).map(x=>sanitize(x,depth+1));
    if(!isObject(value))return null;
    return Object.fromEntries(Object.entries(value).slice(0,80).filter(([k])=>!SECRET.test(k)).map(([k,v])=>[k,sanitize(v,depth+1)]));
  }
  function audit(action,result){try{fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.appendFileSync(logFile,JSON.stringify({time:now(),action,result})+'\n',{mode:0o600})}catch{}}
  async function call(action,args){
    let outcome='rejected';
    try{
      const c=config();if(!c.enabled)throw Error('网关已关闭');
      if(typeof action!=='string'||!NAME.test(action)||SECRET.test(action))throw Error('接口名称无效或受限');
      const meta=catalog().find(x=>x.name===action);if(!meta)throw Error('目录中没有此接口');
      if(!c.allowed.includes(action))throw Error('此接口尚未在网关设置中允许');
      if(meta.unsupported)throw Error('当前 SnowLuma 版本未实现此接口，无法执行');
      validateArgs(action,args,meta);
      if(meta.localSegments){
        if(typeof args.content!=='string'||!args.content.trim())throw Error('分词内容不能为空');
        if(typeof Intl.Segmenter!=='function')throw Error('当前 Node.js 不支持本地分词');
        const words=Array.from(new Intl.Segmenter('zh',{granularity:'word'}).segment(args.content)).filter(x=>x.isWordLike).map(x=>x.segment);
        outcome='accepted';
        return {status:'accepted',data:{slices:words.slice(0,200),truncated:words.length>200},message:'由桥接在本地分词，结果可能与 QQ 原生分词不同。'};
      }
      let result;
      try{result=await request(action,args)}catch{outcome='unknown';throw Error('请求结果未知，请先核实，不要自动重试')}
      if(!result||result.status!=='ok'||result.retcode!==0){
        outcome='failed';
        const code=Number.isSafeInteger(result?.retcode)?'（错误码 '+result.retcode+'）':'';
        throw Error('SnowLuma 未确认接口执行成功'+code);
      }
      outcome='accepted';
      if(action==='set_qq_profile'||action==='set_self_longnick'){
        const expected={};
        if(action==='set_qq_profile'){
          if(Object.hasOwn(args,'nickname'))expected.nickname=args.nickname;
          if(Object.hasOwn(args,'sex'))expected.sex=['unknown','male','female'][args.sex];
        }else expected.long_nick=args.longNick??args.long_nick;
        const unverifiable=action==='set_qq_profile'&&Object.hasOwn(args,'personal_note')?['personal_note']:[];
        let fields={};
        try{
          if(Object.keys(expected).length){
            const login=await request('get_login_info',{});
            if(login?.status!=='ok'||login?.retcode!==0||!Number.isSafeInteger(Number(login?.data?.user_id))||Number(login.data.user_id)<1)throw Error('readback unavailable');
            const profile=await request('get_stranger_info',{user_id:Number(login.data.user_id)});
            if(profile?.status!=='ok'||profile?.retcode!==0||!isObject(profile.data))throw Error('readback unavailable');
            for(const [key,value] of Object.entries(expected))fields[key]=!Object.hasOwn(profile.data,key)?'unavailable':profile.data[key]===value?'matched':'not_matched';
          }
        }catch{for(const key of Object.keys(expected))fields[key]='unavailable';}
        for(const key of unverifiable)fields[key]='unavailable';
        const verified=Object.keys(fields).length>0&&Object.values(fields).every(x=>x==='matched');
        outcome=verified?'verified':'unconfirmed';
        return {status:verified?'verified':'unconfirmed',fields,message:verified?'资料已回读一致。':'SnowLuma 返回成功，但资料尚未回读一致或无法回读；可能存在同步延迟，也可能未生效，请勿自动重复提交。'};
      }
      const safe=sanitize(result.data);if(Buffer.byteLength(JSON.stringify(safe))>24000)return {status:'accepted',message:'返回数据过大，已省略。'};
      if(!meta.readOnly)return {status:'accepted',message:'SnowLuma 返回成功；该操作尚未回读确认实际效果，请勿自动重复提交。',data:safe};
      return {status:'accepted',data:safe};
    }catch(e){if(outcome==='rejected'&&e?.message==='SnowLuma 未确认接口执行成功')outcome='failed';throw e}
    finally{audit(typeof action==='string'&&NAME.test(action)?action:'invalid',outcome)}
  }
  function logs(){try{return fs.readFileSync(logFile,'utf8').split('\n').filter(Boolean).slice(-100).reverse().map(x=>JSON.parse(x))}catch{return []}}
  return {config,saveConfig,list,call,logs,syncCatalog,stats:()=>({total:rawCatalog().length,available:catalog().length})};
}

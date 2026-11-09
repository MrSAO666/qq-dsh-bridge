import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function createStickerSettings({ directory, getKit, request = fetch }) {
  const file = path.join(directory, 'bridge-sticker-settings.json')
  let running = false
  function read() {
    try {
      const data=JSON.parse(fs.readFileSync(file,'utf8'))
      if (typeof data.enabled !== 'boolean') throw Error('表情设置格式无效')
      return {enabled:data.enabled, lastChecked:typeof data.lastChecked==='string'?data.lastChecked:null}
    } catch (e) { if (e.code==='ENOENT') return {enabled:true,lastChecked:null}; throw e }
  }
  function write(data) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700})
    const tmp=file+'.'+crypto.randomUUID()+'.tmp'
    try { fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file) }
    finally { try { fs.unlinkSync(tmp) } catch {} }
  }
  async function status() {
    const state=read(), kit=getKit()
    if (!kit) return {...state,available:false,count:null,updating:running}
    return {...state,available:true,count:(await kit.all()).length,updating:running}
  }
  function setEnabled(enabled) {
    if(typeof enabled!=='boolean') throw Error('开关值无效')
    const state=read();state.enabled=enabled;write(state);return state
  }
  async function update() {
    if(running) throw Error('知识库正在更新，请稍候')
    const kit=getKit()
    if(!kit||typeof kit.fetch!=='function'||typeof kit.refresh!=='function')throw Error('表情插件不可用或不支持更新')
    if(kit.site!=='https://kiriyuki.com')throw Error('表情库来源不受支持')
    running=true
    try {
      const resp=await request('https://kiriyuki.com/meme/kit/nekowhale.json',{redirect:'error',signal:AbortSignal.timeout(20000)})
      if(!resp.ok)throw Error('更新源返回 HTTP '+resp.status)
      const len=Number(resp.headers.get('content-length')||0)
      if(len>2*1024*1024)throw Error('知识库文件过大')
      if(!resp.body)throw Error('更新源没有返回数据')
      const chunks=[];let size=0
      for await (const chunk of resp.body) { size+=chunk.length;if(size>2*1024*1024)throw Error('知识库文件过大');chunks.push(Buffer.from(chunk)) }
      const remote=Buffer.concat(chunks)
      const meta=JSON.parse(remote.toString('utf8'))
      if(meta.schema!=='sticker-kit/1'||!Array.isArray(meta.stickers))throw Error('知识库格式无效')
      const cached=await kit.fetch('meme/kit/nekowhale.json',true)
      if(!Buffer.from(cached).equals(remote))throw Error('知识库刷新未确认，请稍后重试')
      await kit.refresh()
      const state=read();state.lastChecked=new Date().toISOString();write(state)
      return {...state,count:(await kit.all()).length}
    } finally { running=false }
  }
  return {read,status,setEnabled,update}
}

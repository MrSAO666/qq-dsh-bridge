import fs from 'node:fs';
import path from 'node:path';

const CATEGORIES = new Set(['chat', 'bili', 'internal']);
const VIEWS = new Set(['turns', 'requests', 'tools', 'tasks']);
const bjDay = t => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
const idOf = (sid, turn) => `${sid}:${turn}`;
const finite = x => typeof x === 'number' && Number.isFinite(x);

/** Beijing calendar inputs; [from,to), never the browser/server local zone. */
export function tokenTimeRange(query = {}, now = Date.now()) {
  function parse(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/.test(value)) throw Error('时间格式无效');
    const date = value.length === 10 ? value + 'T00:00:00' : value;
    const t = Date.parse(date + '+08:00');
    if (!Number.isFinite(t) || new Date(t + 8 * 3600000).toISOString().slice(0, value.length) !== value) throw Error('日期或时间无效');
    return t;
  }
  if (query.from || query.to) {
    if (!query.from || !query.to) throw Error('请同时填写开始和结束时间');
    const from = parse(query.from), to = parse(query.to);
    if (from >= to) throw Error('结束时间必须晚于开始时间');
    return { from, to, window: 'custom', timezone: 'Asia/Shanghai' };
  }
  const window = query.window || 'today', start = parse(bjDay(now));
  if (window === 'all') return {from:0,to:now + 1,window,timezone:'Asia/Shanghai'};
  if (window === 'today') return {from:start,to:start + 86400000,window,timezone:'Asia/Shanghai'};
  if (window === 'yesterday') return {from:start - 86400000,to:start,window,timezone:'Asia/Shanghai'};
  if (window === '7d') return {from:start - 6 * 86400000,to:start + 86400000,window,timezone:'Asia/Shanghai'};
  throw Error('日期范围无效');
}

/** Metadata only: never persist prompts, tool arguments/results or credentials. */
export function createTokenAudit({file, ledger, now = Date.now, log = () => {}}) {
  const sessions = new Map(), turns = new Map(), tools = new Map(), current = new Map();
  let lines = 0;
  function apply(r) {
    if (!r || typeof r.sid !== 'string') return;
    if (r.k === 'session') sessions.set(r.sid, r);
    if (r.k === 'turn' && Number.isSafeInteger(r.turn)) turns.set(idOf(r.sid, r.turn), r);
    if (r.k === 'tool' && typeof r.callId === 'string') tools.set(idOf(r.sid, r.callId), r);
  }
  try { for (const line of fs.readFileSync(file,'utf8').split('\n')) { if (!line) continue; lines++; try {apply(JSON.parse(line));} catch {} } }
  catch(e) { if(e.code !== 'ENOENT') throw e; }
  function save(row) {
    fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
    fs.appendFileSync(file, JSON.stringify(row)+'\n', {mode:0o600}); apply(row); lines++;
    if (lines > Math.max(5000, (sessions.size + turns.size + tools.size) * 3)) {
      const tmp=file+'.'+process.pid+'.tmp';
      fs.writeFileSync(tmp,[...sessions.values(),...turns.values(),...tools.values()].map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
      fs.renameSync(tmp,file);lines=sessions.size+turns.size+tools.size;
    }
  }
  function registerSession({sessionId, key, category, runId, parentSessionId, mode, label, role}) {
    if(typeof sessionId !== 'string' || !sessionId) return;
    const old=sessions.get(sessionId)||{k:'session',sid:sessionId};
    const row={...old};
    for(const [k,v] of Object.entries({key,category,runId,parentSessionId,mode,label,role})) if(typeof v==='string') row[k]=v.slice(0,200);
    if(!CATEGORIES.has(row.category))row.category='internal';
    if(JSON.stringify(row)!==JSON.stringify(old))save(row);
    if(row.category==='bili') {
      for(const t of turns.values())if((t.spawnedChildId===sessionId||t.resultChildId===sessionId) && t.category!=='bili')save({...t,category:'bili',runId:row.runId||sessionId});
    }
  }
  function tagTurn(sid,turn,extra) {
    if(!Number.isSafeInteger(turn))return;
    const old=turns.get(idOf(sid,turn))||{k:'turn',sid,turn};
    const row={...old,...extra};if(JSON.stringify(row)!==JSON.stringify(old))save(row);
  }
  function ingestEvent(sid,event) {
    if(!event || !Number.isSafeInteger(event.seq))return;
    const d=event.data||{},t=finite(event.time)?event.time:Date.parse(event.time), at=finite(t)?t:now();
    const turn=Number.isSafeInteger(d.turn)?d.turn:current.get(sid);
    if(event.type==='turn/start') {current.set(sid,d.turn);const old=turns.get(idOf(sid,d.turn));if(!old?.startedAt)tagTurn(sid,d.turn,{startedAt:at});}
    if(event.type==='turn/end') {const old=turns.get(idOf(sid,turn));if(!old || (old.endSeq??-1)<event.seq)tagTurn(sid,turn,{endedAt:at,status:String(d.reason?.kind||'ended').slice(0,60),endSeq:event.seq});}
    if(event.type==='user/message') {
      const text=(Array.isArray(d.content)?d.content:[]).filter(x=>x?.type==='text').map(x=>x.text||'').join('');
      const run=text.includes('【后台 B 站浏览】')?text.match(/bili-([a-f0-9-]{36})/i)?.[1]:null;
      const child=d.source?.kind==='subagent-settled'?sessions.get(d.source.senderSessionId):null;
      if(child)tagTurn(sid,turn,{resultChildId:child.sid});
      if(run)tagTurn(sid,turn,{category:'bili',runId:run,source:'automatic'});
      else if(child?.category==='bili')tagTurn(sid,turn,{category:'bili',runId:child.runId||child.sid,source:'subagent-result'});
    }
    if(event.type==='subagent/catalog' && typeof d.childId==='string')tagTurn(sid,turn,{spawnedChildId:d.childId});
    if(!['tool/call','tool/result'].includes(event.type))return;
    const callId=d.callId??d.message?.source?.callId;
    if(typeof callId!=='string' && typeof callId!=='number')return;
    const id=idOf(sid,String(callId)),old=tools.get(id)||{k:'tool',sid,callId:String(callId)};
    if((old.seq??-1)>=event.seq)return;
    const row={...old,seq:event.seq,turn,step:d.step??old.step};
    if(event.type==='tool/call')Object.assign(row,{name:String(d.name||'未知工具').slice(0,160),startedAt:at,status:old.endedAt?old.status:'running'});
    else Object.assign(row,{endedAt:at,status:d.message?.isError===true||d.message?.content?.some(x=>x?.isError===true)?'failed':'completed'});
    save(row);
  }
  function classify(sid,turn) {
    const session=sessions.get(sid)||{},t=turns.get(idOf(sid,turn))||{};
    return {category:t.category||session.category||'chat',runId:t.runId||session.runId||null,key:session.key||null,parentSessionId:session.parentSessionId||null};
  }
  function query(q={}) {
    const range=tokenTimeRange(q,now()),view=q.view||'turns',category=q.category||'all';
    if(!VIEWS.has(view) || (category!=='all'&&!CATEGORIES.has(category)))throw Error('日志类型无效');
    const limit=Math.min(200,Math.max(1,Number(q.limit)||50)),offset=Math.max(0,Math.floor(Number(q.offset)||0));
    const rows=ledger.requests().map(r=>({...r,...classify(r.sessionId,r.turn),key:classify(r.sessionId,r.turn).key||r.key}));
    const selected=rows.filter(r=>r.time>=range.from&&r.time<range.to&&(category==='all'||r.category===category)&&(!q.key||r.key===q.key));
    const sum=xs=>xs.reduce((a,r)=>{a.tokens+=r.tokens;a.cost+=r.cost;a.cacheMiss+=r.cacheMiss;a.cacheHit+=r.cacheHit;a.cacheWrite+=r.cacheWrite;a.output+=r.output;a.requests++;a.estimated||=r.estimated;return a},{tokens:0,cost:0,cacheMiss:0,cacheHit:0,cacheWrite:0,output:0,requests:0,estimated:false});
    function groups(xs,keyOfRow) {
      const groups=new Map();for(const r of xs){const key=keyOfRow(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
      return [...groups].map(([id,items])=>{const first=items[0],info=turns.get(idOf(first.sessionId,first.turn))||{};return {...sum(items),id,key:first.key,category:first.category,runId:first.runId,sessionId:first.sessionId,turn:first.turn,startedAt:Math.min(...items.map(x=>x.time)),endedAt:Math.max(...items.map(x=>x.time)),status:info.status||'recorded',model:[...new Set(items.map(x=>x.model).filter(Boolean))].join(', '),sessions:new Set(items.map(x=>x.sessionId)).size};});
    }
    let entries;
    if(view==='requests')entries=selected.map(r=>({...r,id:`${r.sessionId}:${r.turn}:${r.step}:${r.retry}`,startedAt:r.time,endedAt:r.time}));
    if(view==='turns') {
      entries=groups(selected,r=>idOf(r.sessionId,r.turn));
      const known=new Set(rows.map(r=>idOf(r.sessionId,r.turn)));
      for(const t of turns.values()) {
        const id=idOf(t.sid,t.turn),meta=classify(t.sid,t.turn),at=t.startedAt??t.endedAt;
        if(!known.has(id)&&at>=range.from&&at<range.to&&(category==='all'||meta.category===category)&&(!q.key||meta.key===q.key))entries.push({id,...meta,sessionId:t.sid,turn:t.turn,startedAt:at,endedAt:t.endedAt,status:t.status||'running',tokens:null,cost:null,requests:0});
      }
    }
    if(view==='tasks')entries=groups(selected.filter(r=>r.category==='bili'),r=>r.runId||r.sessionId);
    if(view==='tools'){
      const steps=new Map();for(const r of rows){const k=idOf(r.sessionId,`${r.turn}:${r.step}`);if(!steps.has(k))steps.set(k,[]);steps.get(k).push(r);}
      entries=[...tools.values()].map(r=>({...r,...classify(r.sid,r.turn)})).filter(r=>{const t=r.startedAt??r.endedAt;return t>=range.from&&t<range.to&&(category==='all'||r.category===category)&&(!q.key||r.key===q.key)}).map(r=>({id:idOf(r.sid,r.callId),sessionId:r.sid,turn:r.turn,step:r.step,tool:r.name||'未知工具',key:r.key,category:r.category,runId:r.runId,startedAt:r.startedAt??r.endedAt,endedAt:r.endedAt,status:r.status,durationMs:r.endedAt&&r.startedAt?Math.max(0,r.endedAt-r.startedAt):null,cost:null,independentTokens:null,related:steps.has(idOf(r.sid,`${r.turn}:${r.step}`))?sum(steps.get(idOf(r.sid,`${r.turn}:${r.step}`))):null}));
    }
    entries.sort((a,b)=>(b.startedAt||0)-(a.startedAt||0)||String(a.id).localeCompare(String(b.id)));
    const all=ledger.summary();
    return {ok:true,range,view,category,offset,limit,total:entries.length,hasMore:entries.length>offset+limit,entries:entries.slice(offset,offset+limit),totals:sum(selected),cumulative:all.totals,symbol:all.symbol,currency:all.currency,priceVersion:all.priceVersion,coverage:{retainedRequests:rows.length,oldestRequestAt:rows.length?Math.min(...rows.map(r=>r.time)):null,unattributedCost:all.totals.unattributedCost,detailLimit:ledger.stats().maxLines},note:'金额按当前配置价目表估算。时间段统计仅使用有时间明细的模型请求；历史累计基线不按快照时间分摊。工具关联步骤用量供参考，不重复累加。'};
  }
  return {registerSession,ingestEvent,query,sessionMeta:sid=>sessions.get(sid),childSessions:()=>[...sessions.values()].filter(s=>s.parentSessionId),reset(){sessions.clear();turns.clear();tools.clear();current.clear();fs.writeFileSync(file,'',{mode:0o600})}};
}

// Per-turn runtime limits. No message text, tool arguments or credentials retained.
export function createExecutionBudget({onLimit = () => {}} = {}) {
  let turn, requests=0, inputTokens=0, modelFailures=0, repeatedFailures=0, stopReason='', taskMode=false;
  const seen=new Set(),calls=new Map(),failed=new Map();
  const positive=(v,d)=>Number.isFinite(Number(v))&&Number(v)>0?Math.floor(Number(v)):d;
  function reset(next) {turn=next;requests=0;inputTokens=0;modelFailures=0;repeatedFailures=0;stopReason='';seen.clear();calls.clear();failed.clear();}
  function beforeStep(next,config={},task=false) {
    if(turn!==next)reset(next);
    taskMode=task;
    if(config.enabled===false)return true;
    const cap=positive(task?config.taskMaxRequests:config.chatMaxRequests,task?40:8);
    const tokenCap=positive(task?config.taskMaxInputTokens:config.chatMaxInputTokens,task?1500000:400000);
    const failCap=positive(config.maxRepeatedFailures,2);
    const reason=requests>=cap?'模型请求次数达到上限':inputTokens>=tokenCap?'累计输入达到上限':repeatedFailures>=failCap?'同一工具连续失败达到上限':'';
    if(reason){if(!stopReason){stopReason=reason;onLimit({turn,requests,inputTokens,reason,task});}return false;}
    requests++;return true;
  }
  function event(e) {
    if(!e||!Number.isSafeInteger(e.seq)||seen.has(e.seq))return;
    seen.add(e.seq);const d=e.data||{};
    if(d.turn!==undefined && turn!==d.turn)return;
    if(e.type==='assistant/message' && d.usage){inputTokens+=(d.usage.inputTokens||0)+(d.usage.cacheReadTokens||0)+(d.usage.cacheWriteTokens||0);modelFailures=0;}
    if(e.type==='tool/call')calls.set(String(d.callId),String(d.name));
    if(e.type==='tool/result'){
      const id=String(d.message?.source?.callId),name=calls.get(id);calls.delete(id);
      if(name){if(d.message?.isError){const n=(failed.get(name)||0)+1;failed.set(name,n);}else failed.delete(name);repeatedFailures=Math.max(0,...failed.values());}
    }
  }
  function allowRetry(config={}){
    modelFailures++;
    if(config.enabled===false)return true;
    const cap=positive(taskMode?config.taskMaxRequests:config.chatMaxRequests,taskMode?40:8);
    const allowed=modelFailures<positive(config.maxModelFailures,2)&&requests<cap;
    if(allowed)requests++;
    else if(!stopReason){stopReason='模型连续失败或重试预算达到上限';onLimit({turn,requests,inputTokens,reason:stopReason,task:taskMode});}
    return allowed;
  }
  return {beforeStep,event,allowRetry,snapshot:()=>({turn,requests,inputTokens,modelFailures,repeatedFailures,stopReason})};
}

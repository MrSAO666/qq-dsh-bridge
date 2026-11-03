export function replySendDelay({now,lastIncomingAt=0,lastSentAt=0,firstReplyMinMs=0,minGapMs=0}) {
  const first=lastIncomingAt>lastSentAt?lastIncomingAt+firstReplyMinMs:0;
  const gap=lastSentAt>0?lastSentAt+minGapMs:0;
  return Math.max(0,first-now,gap-now);
}
export function createSendTiming({getState,getConfig,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}) {
  const sentAt=new Map();
  async function wait(key,guard=()=>{}) {
    for(;;){
      guard();const c=getConfig(),st=getState(key)||{};
      const first=key.startsWith('private:')?Number(c.firstReplyMinMs)||0:Number(c.firstReplyMinMsGroup)||0;
      const remaining=replySendDelay({now:now(),lastIncomingAt:Number(st.lastIncomingAt)||0,lastSentAt:Math.max(Number(st.lastAiReplyAt)||0,sentAt.get(key)||0),firstReplyMinMs:Math.max(0,first),minGapMs:c.enforceMinimumGap===false?0:Math.max(0,Number(c.burstIntervalMinMs)||0)});
      if(!remaining)return;
      await sleep(Math.min(remaining,500)); // Recheck permissions, latest arrival, and hot settings.
    }
  }
  function sent(key){sentAt.delete(key);sentAt.set(key,now());while(sentAt.size>1000)sentAt.delete(sentAt.keys().next().value);}
  return {wait,sent};
}

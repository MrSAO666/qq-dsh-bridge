import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client=new Client({name:'bili-readonly-probe',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('src/mcp-bili-read.js')],stderr:'pipe'});
try {
  await client.connect(transport);
  const list=await client.listTools(), names=new Set(list.tools.map(x=>x.name));
  const expected=['bili_search','bili_read_video','bili_user_videos','bili_recommendations','bili_comments','bili_like','bili_comment'];
  console.log('tools:',expected.every(x=>names.has(x)),'unexpected:',[...names].filter(x=>!expected.includes(x)).length);
  const result=await client.callTool({name:'bili_recommendations',arguments:{}});
  let count=0;try{const data=JSON.parse(result.content.find(x=>x.type==='text').text);count=data.videos?.length||0}catch{}
  console.log('recommendation request:',result.isError?'failed':'ok','candidate count:',count);
  if(!expected.every(x=>names.has(x)) || result.isError)process.exitCode=1;
}finally{await client.close()}

import path from 'node:path';

// Only these read/login methods are exposed. Publishing actions need separate
// server-side authorization and quota checks before they can be enabled.
const METHODS = new Set(['bili_login', 'bili_login_check', 'bili_check_credential', 'bili_search', 'bili_user_videos', 'bili_subtitle', 'bili_video_info']);
const BV = /^BV[0-9A-Za-z]{10}$/;

export function createBiliClient({ python, script, dataDir, clientFactory, transportFactory, interactionAdapter = false } = {}) {
  if (!python || !script || !dataDir || !path.isAbsolute(dataDir)) throw new Error('B站运行环境配置不完整');
  const methods = interactionAdapter ? new Set([...METHODS, 'bili_comments', 'bili_like', 'bili_reply', 'bili_recommendations', 'bili_send_message']) : METHODS;
  let client = null, transport = null, connecting = null;
  async function connect() {
    if (client) return client;
    if (connecting) return connecting;
    connecting = (async () => {
      const Client = clientFactory ? null : (await import('@modelcontextprotocol/sdk/client/index.js')).Client;
      const StdioClientTransport = transportFactory ? null : (await import('@modelcontextprotocol/sdk/client/stdio.js')).StdioClientTransport;
      const c = clientFactory ? clientFactory() : new Client({ name: 'qq-bridge-bili', version: '1.0.0' });
      const t = transportFactory ? transportFactory() : new StdioClientTransport({
        command: python, args: [script], env: { ...process.env, QQ_BILI_DATA_DIR: dataDir, BILI_MCP_TOOLS: [...methods].join(',') }, stderr: 'pipe',
      });
      try {
        await c.connect(t);
        const listed = await c.listTools();
        const names = new Set((listed.tools || []).map(x => x.name));
        if ([...names].some(name => !methods.has(name))) throw new Error('B站服务返回了未授权工具');
        for (const name of methods) if (!names.has(name)) throw new Error(`B站服务缺少工具 ${name}`);
        client = c; transport = t;
        return c;
      } catch (err) { await c.close().catch(() => {}); throw err; }
    })();
    try { return await connecting; } finally { connecting = null; }
  }
  async function call(name, args = {}) {
    if (!methods.has(name)) throw new Error('B站工具未授权');
    const result = await (await connect()).callTool({ name, arguments: args });
    if (result.isError) throw new Error('B站服务调用失败');
    const content = result.content?.find(x => x.type === 'text')?.text;
    if (typeof content !== 'string' || content.length > 4_000_000) throw new Error('B站服务返回无效');
    try { return JSON.parse(content); } catch { throw new Error('B站服务返回无法解析'); }
  }
  async function readSubtitledVideo(bvid, maxChars = 4000, offset = 0) {
    if (!BV.test(bvid) || !Number.isInteger(maxChars) || maxChars < 1 || maxChars > 50000 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('视频参数无效');
    const data = await call('bili_subtitle', { bvid });
    // Empty, missing, or failed subtitle is not a watched video.
    if (typeof data.text !== 'string' || !data.text.trim()) return { bvid, available: false };
    return { bvid, available: true, title: String(data.title || '').slice(0, 300), language: String(data.language || '').slice(0, 100), text: data.text.slice(offset, offset + maxChars), offset, nextOffset:offset+maxChars<data.text.length?offset+maxChars:null, totalChars:data.text.length, truncated: offset>0 || data.text.length > maxChars };
  }
  return { call, readSubtitledVideo, async close() { const c = client; client = null; transport = null; if (c) await c.close(); } };
}

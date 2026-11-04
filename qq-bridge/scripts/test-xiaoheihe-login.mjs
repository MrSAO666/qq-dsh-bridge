// Adapted from fbbDirge/dsh-xiaoheihe, MIT; see vendor/xiaoheihe/LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QrLogin } from '../src/xiaoheihe-login.mjs';
const qrUrl = 'https://api.xiaoheihe.cn/account/qr_login/?qr=test-secret&app=web';
function setup() {
  let clock = 10000;
  const replies = [];
  const requests = [];
  const identities = [];
  const qr = new QrLogin({ now: () => clock, encode: async () => 'data:image/png;base64,test', authenticate: (account) => identities.push(account), request: async (...args) => {
    requests.push(args);
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply() : reply;
  } });
  return { qr, replies, requests, identities, advance: (ms = 1600) => clock += ms, start: async () => {
    replies.push({ data: { status: 'ok', result: { qr_url: qrUrl, expire: 120 } }, cookies: ['qr_cookie=abc; Path=/; HttpOnly'] });
    return qr.start();
  } };
}
const state = (error, extra = {}) => ({ data: { status: 'ok', result: { error, ...extra } }, cookies: [] });

test('QR lifecycle: waiting, scanned, confirmed; secrets remain on host', async () => {
  const s = setup(); const started = await s.start();
  assert.equal(started.expiresAt, 130000);
  assert.equal(started.status, 'waiting');
  assert.ok(!JSON.stringify(started).includes('test-secret'));
  s.replies.push(state('wait')); await s.qr.poll(started.sessionId);
  assert.equal(s.requests.at(-1)[2], 'qr_cookie=abc');
  const count = s.requests.length;
  await s.qr.poll(started.sessionId); assert.equal(s.requests.length, count, 'polls are throttled');
  s.advance(); s.replies.push(state('ready'));
  assert.equal((await s.qr.poll(started.sessionId)).status, 'scanned');
  s.advance(); s.replies.push(state('ok', { profile: { heybox_id: 123 }, pkey: 'private-key' }));
  const confirmed = await s.qr.poll(started.sessionId);
  assert.equal(confirmed.status, 'authenticated'); assert.equal(confirmed.image, null);
  assert.equal(s.identities[0].heyboxId, '123');
  assert.ok(s.identities[0].cookie.includes('user_pkey=private-key'));
  assert.ok(!JSON.stringify(confirmed).includes('private-key'));
  await s.qr.poll(started.sessionId); assert.equal(s.identities.length, 1);
});
test('confirmation can restore login from host-only cookies', async () => {
  const s = setup(); const started = await s.start();
  s.replies.push({ ...state('ok'), cookies: ['user_pkey=server-key; HttpOnly; Path=/'] },
    { data: { status: 'ok', result: { account_detail: { userid: '456' }, pkey: 'restored' } }, cookies: [] });
  assert.equal((await s.qr.poll(started.sessionId)).status, 'authenticated');
  assert.equal(s.requests.at(-1)[0], '/account/restore_login');
  assert.ok(s.requests.at(-1)[2].includes('user_pkey=server-key'));
});
test('local expiry, platform expiry and 2FA never authenticate', async () => {
  for (const mode of ['clock', 'platform', '2fa']) {
    const s = setup(); const started = await s.start();
    if (mode === 'clock') s.advance(120001);
    else s.replies.push(mode === 'platform' ? state('expired') : { data: { status: 'need_google_check', result: { secret: 'never-expose' } }, cookies: [] });
    const result = await s.qr.poll(started.sessionId);
    assert.equal(result.status, mode === '2fa' ? 'requires_2fa' : 'expired');
    assert.equal(result.image, null); assert.equal(s.identities.length, 0);
    assert.ok(!JSON.stringify(result).includes('never-expose'));
  }
});
test('cancel or refresh during an in-flight confirmation cannot overwrite account', async () => {
  for (const replace of [false, true]) {
    const s = setup(); const started = await s.start();
    let resolve;
    s.replies.push(() => new Promise((done) => resolve = done));
    const pending = s.qr.poll(started.sessionId);
    if (replace) await s.start(); else s.qr.cancelSession(started.sessionId);
    resolve(state('ok', { profile: { heybox_id: '123' }, pkey: 'old-key' }));
    await assert.rejects(pending, /取消/); assert.equal(s.identities.length, 0);
  }
});
test('reject missing credentials, untrusted QR URLs and retry after network errors', async () => {
  const s = setup();
  s.replies.push({ data: { status: 'ok', result: { qr_url: 'https://example.org/?qr=x' } } });
  await assert.rejects(s.qr.start(), /二维码无效/);
  const started = await s.start();
  s.replies.push(new Error('network')); await assert.rejects(s.qr.poll(started.sessionId), /network/);
  s.advance(); s.replies.push(state('ok'), { data: { status: 'login' }, cookies: [] });
  await assert.rejects(s.qr.poll(started.sessionId), /完整登录凭据/);
  assert.equal(s.identities.length, 0);
});

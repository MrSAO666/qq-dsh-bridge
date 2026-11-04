import assert from 'node:assert/strict';
import { DEFAULT_BILI_CONFIG, normalizeBiliConfig } from '../src/bili-config.mjs';
import { reserveBiliInteraction } from '../src/bili-interaction-policy.mjs';

const cfg = normalizeBiliConfig(structuredClone(DEFAULT_BILI_CONFIG));
const state = { version: 1, counts: {} };
assert.throws(() => reserveBiliInteraction(state, {kind:'dm', config:cfg, receiverUid:'123', text:'你好'}), /未启用/);
cfg.interactions.dmEnabled = true;
cfg.interactions.dmUids = ['123'];
cfg.interactions.dmDailyLimit = 1;
assert.throws(() => reserveBiliInteraction(state, {kind:'dm', config:cfg, receiverUid:'124', text:'你好'}), /收件人/);
const next = reserveBiliInteraction(state, {kind:'dm', config:cfg, receiverUid:'123', text:'你好'});
assert.throws(() => reserveBiliInteraction(next, {kind:'dm', config:cfg, receiverUid:'123', text:'你好'}), /用完/);
console.log('B站私信权限与额度测试通过');

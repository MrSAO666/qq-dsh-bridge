import assert from 'node:assert/strict';
import { DEFAULT_BILI_CONFIG, normalizeBiliConfig } from '../src/bili-config.mjs';
const config = () => structuredClone(DEFAULT_BILI_CONFIG);
assert.deepEqual(normalizeBiliConfig(config()).dailyRuns, 3);
assert.equal(normalizeBiliConfig(config()).durationMinutes, 20);
const dup = config(); dup.sources.keywords = [' AI ', 'AI']; dup.sources.followUids = ['123', 123];
assert.deepEqual(normalizeBiliConfig(dup).sources.keywords, ['AI']);
assert.deepEqual(normalizeBiliConfig(dup).sources.followUids, ['123']);
const noUid = config(); noUid.interactions.mentionEnabled = true;
assert.throws(() => normalizeBiliConfig(noUid), /名单为空/);
const withUid = config(); withUid.interactions.mentionEnabled = true; withUid.interactions.mentionUids = ['123'];
assert.equal(normalizeBiliConfig(withUid).interactions.mentionEnabled, true);
for (const value of ['0', '1e3', '-1', '9999999999999999']) {
  const bad = config(); bad.sources.followUids = [value];
  assert.throws(() => normalizeBiliConfig(bad), /UID/);
}
console.log('B站设置测试通过');

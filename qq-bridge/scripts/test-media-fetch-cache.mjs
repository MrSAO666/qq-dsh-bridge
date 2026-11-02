import assert from 'node:assert/strict';
import { createMediaFetchCache } from '../src/media-fetch-cache.mjs';

let time = 0, calls = 0;
const cache = createMediaFetchCache({ maxBytes: 4, ttlMs: 10, now: () => time });
const fetcher = async () => { calls++; return { buffer: Buffer.from('abc'), mimeType: 'image/png' }; };
const [first, second] = await Promise.all([cache.get('x', fetcher), cache.get('x', fetcher)]);
assert.equal(calls, 1); assert.equal(first.buffer.toString(), 'abc'); assert.equal(second.mimeType, 'image/png');
await cache.get('x', fetcher); assert.equal(calls, 1);
time = 10; await cache.get('x', fetcher); assert.equal(calls, 2);
await cache.get('y', fetcher); await cache.get('x', fetcher); assert.equal(calls, 4); // 4-byte limit evicts x
let failures = 0;
await cache.get('bad', async () => { failures++; return null; });
await cache.get('bad', async () => { failures++; return null; });
assert.equal(failures, 2);
await assert.rejects(cache.get('err', async () => { throw new Error('failed'); }));
await cache.get('err', fetcher); assert.equal(calls, 5);
console.log('media fetch cache tests passed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createBrowseIntent} from '../src/browse-intent.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'browse-intent-')); let now=1000000;
try {
 const file=path.join(dir,'run.json'), intent=createBrowseIntent(file,()=>now);
 assert.equal(intent.read(),null);assert.equal(intent.request(),true);assert.equal(intent.request(),false);
 assert.ok(createBrowseIntent(file,()=>now).read(),'restart retains decision');
 now+=15*60*1000;assert.equal(intent.read(),null,'expired decision must not dispatch');
 assert.equal(intent.request(),true);intent.clear();assert.equal(intent.read(),null);
 console.log('PASS browse intent persistence, deduplication and expiry');
} finally {fs.rmSync(dir,{recursive:true,force:true});}

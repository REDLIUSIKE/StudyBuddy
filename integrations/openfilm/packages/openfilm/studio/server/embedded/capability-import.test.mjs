import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {fixture,scope,caller} from './capability-fixture.mjs';
test('importIsExclusiveAndIdempotent with Chinese and space collisions',async t=>{
 const f=await fixture(t),input=content=>({name:'汽车 素材.png',mime:'image/png',base64:Buffer.from(content).toString('base64'),sha256:createHash('sha256').update(content).digest('hex')});
 const [a,b]=await Promise.all(['first','second'].map(value=>f.domain.capability(scope,caller,'importAsset',input(value))));
 assert.notEqual(a.relativePath,b.relativePath);
 assert.equal(await readFile(join(f.root,a.relativePath),'utf8'),'first');assert.equal(await readFile(join(f.root,b.relativePath),'utf8'),'second');
 assert.equal((await f.domain.capability(scope,caller,'importAsset',input('first'))).relativePath,a.relativePath);
});

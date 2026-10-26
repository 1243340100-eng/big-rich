import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {brotliCompressSync,gzipSync} from 'node:zlib';
import {staticAssets} from '../server/staticAssets';

test('static assets negotiate compression, preserve content, and revalidate HTML',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'capital-static-'));
  await mkdir(path.join(directory,'assets'));
  const source='console.log("城市加载");'.repeat(80);
  await writeFile(path.join(directory,'assets/app-abc.js'),source);
  await writeFile(path.join(directory,'assets/app-abc.js.br'),brotliCompressSync(source));
  await writeFile(path.join(directory,'assets/app-abc.js.gz'),gzipSync(source));
  await writeFile(path.join(directory,'index.html'),'<html>home</html>');
  const app=express();app.use(staticAssets(directory));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}`;
  try{
    for(const [accept,expected] of [['br, gzip','br'],['gzip','gzip'],['br;q=0, gzip','gzip'],['identity',''],['','']]){
      const response=await fetch(url+'/assets/app-abc.js',{headers:{'Accept-Encoding':accept}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('Content-Encoding')??'',expected);
      assert.match(response.headers.get('Cache-Control')!,/immutable/);
      assert.match(response.headers.get('Vary')!,/Accept-Encoding/);
      assert.match(response.headers.get('Content-Type')!,/javascript/);
      assert.equal(await response.text(),source);
    }
    const head=await fetch(url+'/assets/app-abc.js',{method:'HEAD',headers:{'Accept-Encoding':'br'}});
    assert.equal(head.headers.get('Content-Encoding'),'br');assert.equal(await head.text(),'');
    const cached=await fetch(url+'/assets/app-abc.js',{headers:{'Accept-Encoding':'br','If-None-Match':head.headers.get('ETag')!,'Cache-Control':'max-age=0'}});
    assert.equal(cached.status,304);
    const html=await fetch(url+'/');assert.equal(html.headers.get('Cache-Control'),'no-cache');
    assert.equal((await fetch(url+'/assets/missing.js')).status,404);
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});

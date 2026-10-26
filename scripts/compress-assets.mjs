import {readdir,readFile,writeFile} from 'node:fs/promises';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
const directory=new URL('../dist/assets/',import.meta.url);
let raw=0,br=0,gzip=0;
for(const name of await readdir(directory)){
  if(!/\.(js|css)$/.test(name))continue;
  const source=await readFile(new URL(name,directory));
  const brotli=brotliCompressSync(source,{params:{[constants.BROTLI_PARAM_QUALITY]:9}});
  const gz=gzipSync(source,{level:9});
  await writeFile(new URL(name+'.br',directory),brotli);
  await writeFile(new URL(name+'.gz',directory),gz);
  raw+=source.length;br+=brotli.length;gzip+=gz.length;
}
console.log(`Static assets: ${raw} bytes -> Brotli ${br} bytes / gzip ${gzip} bytes`);

import express from 'express';
import path from 'node:path';
import {existsSync} from 'node:fs';

/** Serve build-time compressed assets without spending CPU on each request. */
export function staticAssets(directory:string){
  const router=express.Router();
  router.use((req,res,next)=>{
    if(!['GET','HEAD'].includes(req.method)||!/^\/assets\/[\w.-]+\.(js|css)$/.test(req.path))return next();
    res.vary('Accept-Encoding');
    const encoding=req.headers['accept-encoding']?req.acceptsEncodings('br','gzip','identity'):'identity';
    const suffix=encoding==='br'?'.br':encoding==='gzip'?'.gz':null;
    const file=path.join(directory,req.path);
    if(!suffix||!existsSync(file+suffix))return next();
    res.type(req.path.endsWith('.js')?'application/javascript':'text/css');
    res.setHeader('Content-Encoding',encoding as string);
    res.sendFile(file+suffix,{maxAge:'1y',immutable:true},error=>{if(error)next(error);});
  });
  router.use(express.static(directory,{
    setHeaders(res,file){
      res.setHeader('Cache-Control',/[/\\]assets[/\\]/.test(file)?'public, max-age=31536000, immutable':'no-cache');
    },
  }));
  return router;
}

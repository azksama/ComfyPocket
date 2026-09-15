import {test} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {certificate} from './certificate.mjs';
import {checkHealth} from './health.mjs';

test('startup readiness requires authenticated TLS and a ready ComfyUI, not just a listening bridge', async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'comfy-health-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const cert=await certificate(['127.0.0.1']);
 let ready=false;
 const server=https.createServer({key:cert.private,cert:cert.cert},(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.headers.authorization!=='Bearer test-only-health'){res.writeHead(401);return res.end('{}');}
  if(req.url==='/bridge/info')return res.end(JSON.stringify({version:3}));
  if(!ready){res.writeHead(502);return res.end('{}');}
  res.end(JSON.stringify({system:{comfyui_version:'test'},devices:[]}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const config={host:'0.0.0.0',port:server.address().port,token:'test-only-health'};
 await writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 await writeFile(path.join(dir,'cert.pem'),cert.cert);
 await checkHealth(dir);
 await assert.rejects(checkHealth(dir,{upstream:true}),/502/);
 ready=true;
 await checkHealth(dir,{upstream:true});
 await writeFile(path.join(dir,'config.json'),JSON.stringify({...config,token:'invalid-test-token'}));
 await assert.rejects(checkHealth(dir,{upstream:true}),/401/);
 await writeFile(path.join(dir,'config.json'),JSON.stringify(config));
 await writeFile(path.join(dir,'cert.pem'),(await certificate(['127.0.0.1'])).cert);
 await assert.rejects(checkHealth(dir,{upstream:true}));
});

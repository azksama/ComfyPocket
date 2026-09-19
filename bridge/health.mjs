import https from 'node:https';
import { loadIdentity } from './identity.mjs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function checkHealth(dir, {upstream = false} = {}) {
 const config=JSON.parse(await readFile(path.join(dir,'config.json'),'utf8'));
 const cert=await readFile(path.join(dir,'cert.pem'));
 const host=config.host==='0.0.0.0'?'127.0.0.1':config.host;
 const get=route=>new Promise((resolve,reject)=>{
  const req=https.get(`https://${host}:${config.port}${route}`,{ca:cert,headers:{Authorization:`Bearer ${config.token}`},timeout:5000},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);
   res.on('end',()=>{
    if(res.statusCode!==200)return reject(Error(`Service indisponible (${route}, HTTP ${res.statusCode}).`));
    try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('Reponse du serveur invalide.'));}
   });
  });
  req.on('timeout',()=>req.destroy(Error('Delai de connexion depasse.')));req.on('error',reject);
 });
 const info=await get('/bridge/info');
 if(!(info.version>=3))throw Error('Ancien compagnon actif. Fermez sa console puis relancez ComfyPocket.');
 if(upstream){const stats=await get('/api/system_stats');if(!stats.system||!Array.isArray(stats.devices))throw Error('ComfyUI ne repond pas correctement.');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.includes('--identity-only'))await loadIdentity(process.argv[2]);else await checkHealth(process.argv[2],{upstream:process.argv.includes('--upstream')});if(!process.argv.includes('--quiet'))console.log(process.argv.includes('--identity-only')?'Identite persistante du compagnon verifiee.':'Connexion HTTPS authentifiee et services verifies.');}
 catch(error){if(!process.argv.includes('--quiet'))console.error(error.code||error.message);process.exitCode=1;}
}

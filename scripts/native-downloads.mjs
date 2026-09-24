import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import path from 'node:path';

export const run=(command,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(command,args,{stdio:'inherit',shell:false,windowsHide:true,...options});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`${command} exited ${code}`)));
});
export async function sha256(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function download(url,file,hash){
  if(await fs.stat(file).catch(()=>null)&&(!hash||await sha256(file)===hash))return;
  await fs.mkdir(path.dirname(file),{recursive:true});
  const response=await fetch(url);if(!response.ok)throw new Error(`Download failed: ${response.status} ${url}`);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(file+'.partial'));
  if(hash&&await sha256(file+'.partial')!==hash){await fs.rm(file+'.partial',{force:true});throw new Error(`SHA-256 mismatch: ${file}`);}
  await fs.rename(file+'.partial',file);
}
export async function extract(archive,destination){
  const {default:sevenZip}=await import('7zip-bin');
  if(process.platform!=='win32')await fs.chmod(sevenZip.path7za,0o755);
  await run(sevenZip.path7za,['x','-y','-bso0','-bsp0',archive,`-o${destination}`]);
}

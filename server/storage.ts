import fs from 'node:fs/promises';
import path from 'node:path';
import type {Library} from './library';
import type {Jobs} from './jobs';

async function bytes(file:string):Promise<number>{const st=await fs.lstat(file).catch(()=>null);if(!st||st.isSymbolicLink())return 0;if(st.isFile())return st.size;if(!st.isDirectory())return 0;return (await Promise.all((await fs.readdir(file)).map(name=>bytes(path.join(file,name))))).reduce((a,b)=>a+b,0);}
export class Storage {
 private cleaning=false;
 constructor(private library:Library,private jobs:Jobs){}
 private async candidates(){
  const exports:string[]=[];const live=new Set(this.jobs.list().map(j=>j.id));
  for(const entry of await fs.readdir(this.jobs.root,{withFileTypes:true})){const file=path.join(this.jobs.root,entry.name);if(!entry.isDirectory()||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(entry.name)||live.has(entry.name)||this.library.records.some(m=>m.path===file||m.path.startsWith(file+path.sep)))continue;exports.push(file);}
  const cache=path.join(this.library.root,'cache');
  const proxies=this.library.records.filter(m=>m.proxyStatus==='ready'&&!this.library.records.some(source=>source.path===path.join(cache,`${m.id}.proxy.mp4`))).map(m=>({id:m.id,file:path.join(cache,`${m.id}.proxy.mp4`)}));
  return {exports,proxies};
 }
 async info(){const items=await this.candidates();return {folders:[{name:'預覽代理檔',path:path.join(this.library.root,'cache'),bytes:(await Promise.all(items.proxies.map(m=>bytes(m.file)))).reduce((a,b)=>a+b,0)},{name:'已關閉工作的匯出暫存',path:this.jobs.root,bytes:(await Promise.all(items.exports.map(bytes))).reduce((a,b)=>a+b,0)}],cleaning:this.cleaning};}
 async clear(){if(this.cleaning)throw new Error('正在清除暫存，請稍候');this.cleaning=true;let freedBytes=0;try{const items=await this.candidates();for(const file of items.exports){const size=await bytes(file);await fs.rm(file,{recursive:true,force:true});freedBytes+=size;}for(const item of items.proxies){const m=this.library.get(item.id);if(m.proxyStatus!=='ready')continue;const size=await bytes(item.file);await fs.rm(item.file,{force:true});m.proxy=undefined;m.proxyStatus=undefined;freedBytes+=size;}await this.library.save();return {freedBytes,...await this.info()};}finally{this.cleaning=false;}}
}

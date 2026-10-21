import { loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { probe } from './native';
import type { Library } from './library';

export async function importLogo(library:Library,projectId:string,bytes:Buffer,name:string){
 z.string().uuid().parse(projectId);
 if(!bytes.length||bytes.length>32*1024**2)throw new Error('Logo 圖片必須小於 32 MB');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpeg&&!webp)throw new Error('Logo 支援 PNG、JPG 與 WebP 圖片');
 const extension=png?'.png':jpeg?'.jpg':'.webp',directory=path.join(library.root,'projects',projectId,'logos');await fs.mkdir(directory,{recursive:true});
 const file=path.join(directory,randomUUID()+extension);await fs.writeFile(file,bytes,{flag:'wx'});
 try{
  const info=await probe(file),video=info.streams.find((s:any)=>s.codec_type==='video');
  if(!video||!['png','mjpeg','webp'].includes(video.codec_name)||!video.width||!video.height||video.width>8192||video.height>8192)throw new Error('Logo 請使用長寬不超過 8192 像素的靜態圖片');
  await loadImage(bytes);
  return await library.import(file,true,(path.parse(path.basename(name)).name||'Logo').slice(0,250)+extension);
 }catch(error){await fs.rm(file,{force:true});throw error;}
}

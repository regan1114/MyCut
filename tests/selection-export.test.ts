import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCanvas} from '@napi-rs/canvas';
import {SelectionExporter} from '../server/selection-export';
import {Library} from '../server/library';
import {ffmpeg,probe} from '../server/native';
import {newProject,makeClip,uid} from '../shared/model';
import {selectedExportClips} from '../shared/selection-export';

test('selected source export validates types, trims source ranges and exports native images/audio without project effects',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reelume-selection-')),library=new Library(root),exporter=new SelectionExporter(library);
 try{await library.init();const source=path.join(root,'source.mp4');await ffmpeg(['-f','lavfi','-i','color=c=red:s=160x90:d=3:r=30','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac','-shortest',source]);const m=await library.import(source),png=path.join(root,'image.png'),canvas=createCanvas(37,29);canvas.getContext('2d').fillRect(0,0,37,29);await fs.writeFile(png,canvas.toBuffer('image/png'));const image=await library.import(png);
 const p=newProject();p.clips=[makeClip({kind:'video',trackId:'main',mediaId:m.id,name:'裁切影片',start:150,duration:15,sourceIn:.5,speed:2,scale:.3,volume:0,brightness:1}),makeClip({kind:'audio',trackId:'music',mediaId:m.id,name:'聲音',start:90,duration:30,sourceIn:1,volume:0}),makeClip({kind:'image',trackId:'main',mediaId:image.id,name:'圖片',start:180,duration:90,crop:.4}),makeClip({kind:'text',trackId:'text',start:0,duration:30,text:'不應輸出'})];const before=JSON.stringify(p);
 assert.throws(()=>selectedExportClips({id:uid(),project:p,clipIds:[p.clips[3].id]}),/只能/);assert.throws(()=>selectedExportClips({id:uid(),project:p,clipIds:[uid()]}),/只能/);
 const dir=path.join(root,'out');await fs.mkdir(dir);const result=await exporter.export({id:uid(),project:p,clipIds:p.clips.slice(0,3).map(c=>c.id)},dir);assert.equal(result.paths.length,3);assert.equal(JSON.stringify(p),before);
 const video=await probe(result.paths.find(f=>f.endsWith('.mp4'))!);assert.ok(Math.abs(Number(video.format.duration)-1)<.1);assert.equal(video.streams.find((s:any)=>s.codec_type==='video').width,160);assert.ok(video.streams.some((s:any)=>s.codec_type==='audio'));
 const audio=await probe(result.paths.find(f=>f.endsWith('.wav'))!);assert.equal(audio.streams.length,1);assert.equal(audio.streams[0].codec_name,'pcm_s16le');assert.ok(Math.abs(Number(audio.format.duration)-1)<.1);
 const picture=await probe(result.paths.find(f=>f.endsWith('.png'))!);assert.equal(picture.streams[0].width,37);assert.equal(picture.streams[0].height,29);
 await assert.rejects(exporter.export({id:uid(),project:p,clipIds:[p.clips[0].id]},source),/覆蓋來源/);
 const id=uid(),canceled=exporter.export({id,project:p,clipIds:[p.clips[0].id]},path.join(dir,'canceled.mp4'));exporter.cancel(id);assert.equal((await canceled).canceled,true);assert.equal((await fs.readdir(dir)).some(f=>f.includes('selection-')||f==='canceled.mp4'),false);assert.equal(exporter.isRunning,false);
 }finally{exporter.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});

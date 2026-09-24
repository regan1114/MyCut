import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ffmpeg, probe } from '../server/native';
import { Library } from '../server/library';
import { Jobs } from '../server/jobs';
import { newProject, makeClip, type FontInfo } from '../shared/model';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-export-test-'));
const fontRoot=path.resolve('public/fonts');const fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
const source=path.join(root,'source.mp4');await ffmpeg(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','7','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',source]);
const library=new Library(root);await library.init();const m=await library.import(source);
const p=newProject();p.name='實際影音匯出驗證';p.clips=[
 makeClip({kind:'video',trackId:'main',mediaId:m.id,start:0,duration:90,name:'A',volume:.3}),
 makeClip({kind:'video',trackId:'main',mediaId:m.id,start:90,duration:90,sourceIn:3,name:'B',volume:.3,speed:1.25,brightness:.04,saturation:.7}),
 makeClip({kind:'text',trackId:'text',start:15,duration:150,text:'MyCut 商用字型驗證\n你好，世界。',fontId:'huninn',fontSize:90,fadeIn:10,fadeOut:10}),
 makeClip({kind:'shape',trackId:'overlay',start:45,duration:60,color:'#5edacc',shape:'circle',scale:.2,x:.3,y:.2,keyframes:[{frame:0,x:-.2,y:.2,scale:.2,opacity:.6},{frame:60,x:.3,y:.2,scale:.3,opacity:.9}]}),
];
const jobs=new Jobs(path.join(root,'exports'),library,fonts,fontRoot);await jobs.init();const job=await jobs.create(p,{resolution:720,quality:'standard',encoder:'libx264'});
let pauseTested=false;let restored=false;let deadline=Date.now()+180000;
while(!['completed','failed'].includes(job.status)){
 await new Promise(r=>setTimeout(r,150));
 if(!pauseTested&&job.completedSegments>=1&&job.status==='running'){await jobs.pause(job.id);pauseTested=true;while(jobs.isRunning)await new Promise(r=>setTimeout(r,50));assert.equal(job.status,'paused');const completed=job.completedSegments;const restoredJobs=new Jobs(path.join(root,'exports'),library,fonts,fontRoot);await restoredJobs.init();assert.equal(restoredJobs.get(job.id).completedSegments,completed);restored=true;await jobs.resume(job.id);console.log(`Pause / restore / resume verified after ${completed} segments.`);}
 if(Date.now()>deadline)throw new Error('Export timed out');
}
assert.equal(job.status,'completed',job.error);assert.equal(pauseTested,true);assert.equal(restored,true);
const output=path.join(jobs.dir(job),'output.mp4');const info=await probe(output);assert.ok(Math.abs(Number(info.format.duration)-6)<.1);const v=info.streams.find((s:any)=>s.codec_type==='video');const a=info.streams.find((s:any)=>s.codec_type==='audio');assert.equal(v.width,1280);assert.equal(v.height,720);assert.equal(v.nb_frames,'180');assert.equal(a.sample_rate,'48000');
await ffmpeg(['-ss','2','-i',output,'-frames:v','1',path.join(root,'frame.png')]);
const invalid={...p,id:crypto.randomUUID(),clips:[{...p.clips[0],mediaId:crypto.randomUUID()}]};await assert.rejects(()=>jobs.create(invalid,{resolution:720,quality:'standard',encoder:'libx264'}),/素材不存在/);
console.log(JSON.stringify({success:true,duration:info.format.duration,frames:v.nb_frames,audioDuration:a.duration,output,frame:path.join(root,'frame.png'),pauseResume:true,restoredManifest:true},null,2));library.close();jobs.close();

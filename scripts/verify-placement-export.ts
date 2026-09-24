import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { newProject, makeClip, type FontInfo } from '../shared/model';
import { appendClips } from '../shared/placement';
import { dissolveClip } from '../shared/editing';
import { Library } from '../server/library';
import { Jobs } from '../server/jobs';
import { ffmpeg, probe } from '../server/native';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-placement-export-')),fontRoot=path.resolve('public/fonts');
const fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
const library=new Library(root);await library.init();const jobs=new Jobs(path.join(root,'exports'),library,fonts,fontRoot);await jobs.init();
try{
  let p=newProject();p.name='接續文字與分軌溶解';
  const red=makeClip({kind:'shape',trackId:'main',start:0,duration:90,color:'#ff0000'}),blue=makeClip({kind:'shape',trackId:'main',start:90,duration:90,color:'#0000ff'});
  p.clips=[red,blue];p=dissolveClip(p,blue.id);
  for(const text of ['第一段','第二段'])p=appendClips(p,[makeClip({kind:'text',trackId:'text',start:0,duration:30,text,y:.35,fontId:'huninn',fontSize:56})]);
  assert.deepEqual(p.clips.filter(c=>c.kind==='text').map(c=>c.start),[0,30]);
  const job=await jobs.create(p,{resolution:720,quality:'standard',encoder:'libx264'}),deadline=Date.now()+90000;
  while(!['completed','failed'].includes(job.status)){if(Date.now()>deadline)throw new Error('Export timeout');await new Promise(r=>setTimeout(r,150));}
  assert.equal(job.status,'completed',job.error);const output=path.join(jobs.dir(job),'output.mp4'),info=await probe(output);assert.equal(info.streams.find((s:any)=>s.codec_type==='video').nb_frames,'165');
  const pixel=async(time:number)=>{const file=path.join(root,`pixel-${time}.rgb`);await ffmpeg(['-ss',String(time),'-i',output,'-frames:v','1','-vf','crop=2:2:640:360,scale=1:1','-pix_fmt','rgb24','-f','rawvideo',file]);return [...await fs.readFile(file)];};
  const before=await pixel(2.2),middle=await pixel(2.75),after=await pixel(3.2);
  assert.ok(before[0]>200&&before[2]<15,JSON.stringify(before));assert.ok(middle[0]>50&&middle[2]>50,JSON.stringify(middle));assert.ok(after[2]>200&&after[0]<15,JSON.stringify(after));
  const report={version:JSON.parse(await fs.readFile('package.json','utf8')).version,testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,resolution:720,frames:165,duration:Number(info.format.duration),textStarts:[0,30],separateTrackDissolve:true,pixels:{before,middle,after},output};
  await fs.writeFile('docs/placement-export-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{jobs.close();library.close();}

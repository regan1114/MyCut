import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeClip, newProject, type FontInfo } from '../shared/model';
import { defaultEffects } from '../shared/effects';
import { renderSegment } from '../server/render';
import { Library } from '../server/library';
import { Jobs } from '../server/jobs';
import { Projects } from '../server/projects';
import { PortableProjects } from '../server/portable';
import { ffmpeg, probe } from '../server/native';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-workflow-')),library=new Library(root),fontRoot=path.resolve('public/fonts');
const fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
await library.init();const jobs=new Jobs(path.join(root,'exports'),library,fonts,fontRoot);await jobs.init();
try{
  const source=path.join(root,'original.mp4');await ffmpeg(['-f','lavfi','-i','color=c=0x808080:size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-preset','ultrafast','-c:a','aac',source]);
  const m=await library.import(source),p=newProject();p.name='時段特效與專案還原驗證';p.tracks.unshift({id:'fx',kind:'effect',name:'特效',hidden:false,locked:false,muted:false});
  p.clips=[makeClip({kind:'video',trackId:'main',mediaId:m.id,start:0,duration:120}),makeClip({kind:'effect',trackId:'fx',start:30,duration:60,fadeIn:15,fadeOut:15,effects:{...defaultEffects(),enabled:['vignette'],intensity:1}})];
  const settings={resolution:720 as const,quality:'standard' as const,encoder:'libx264' as const};
  const job=await jobs.create(p,settings);let paused=false;
  const deadline=Date.now()+90000;
  while(!['completed','failed'].includes(job.status)){
    await new Promise(r=>setTimeout(r,50));if(!paused&&job.completedSegments>=1&&job.status==='running'){await jobs.pause(job.id);const stopDeadline=Date.now()+10000;while(jobs.isRunning){if(Date.now()>stopDeadline)throw new Error('Pause did not release the active segment');await new Promise(r=>setTimeout(r,50));}assert.equal(job.status,'paused');await jobs.resume(job.id);paused=true;}
    if(Date.now()>deadline)throw new Error('Timed-effects export timed out');
  }
  assert.equal(job.status,'completed',job.error);assert.equal(paused,true);const movie=path.join(jobs.dir(job),'output.mp4');const info=await probe(movie);assert.equal(info.streams.find((s:any)=>s.codec_type==='video').nb_frames,'120');
  const sample=async(file:string,time:number)=>{const raw=path.join(root,`sample-${Math.random()}.rgb`);await ffmpeg(['-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=320:180','-pix_fmt','rgb24','-f','rawvideo',raw]);const data=await fs.readFile(raw);await fs.rm(raw);let sum=0,count=0;for(let y=5;y<20;y++)for(let x=5;x<20;x++){const i=(y*320+x)*3;sum+=data[i]+data[i+1]+data[i+2];count+=3;}return sum/count;};
  const before=await sample(movie,.5),fade=await sample(movie,1.2),inside=await sample(movie,2),after=await sample(movie,3.5);assert.ok(Math.abs(before-after)<3);assert.ok(inside<before-15);assert.ok(fade>inside+5&&fade<before-3);
  // Compare a resumed slice against the matching absolute time in a continuous render.
  const continuous=path.join(root,'continuous.mov'),slice=path.join(root,'slice.mov');
  await renderSegment(p,library,fonts,fontRoot,0,120,settings,continuous,path.join(root,'continuous-assets'),{size:{width:320,height:180}});
  await renderSegment(p,library,fonts,fontRoot,60,90,settings,slice,path.join(root,'slice-assets'),{size:{width:320,height:180}});
  assert.ok(Math.abs(await sample(continuous,2.2)-await sample(slice,.2))<3);
  const pack=new PortableProjects(library,new Projects(root,library)),bundle=path.join(root,'project.mycutpack');await pack.export(p,bundle);
  const restoredLibrary=new Library(path.join(root,'restored'));await restoredLibrary.init();
  try{
    await fs.rename(source,source+'.removed');const restored=await new PortableProjects(restoredLibrary,new Projects(restoredLibrary.root,restoredLibrary)).import(bundle);
    const restoredMovie=path.join(root,'restored.mov');await renderSegment(restored,restoredLibrary,fonts,fontRoot,30,90,settings,restoredMovie,path.join(root,'restored-assets'),{size:{width:320,height:180}});assert.ok(Math.abs(await sample(restoredMovie,1)-inside)<3);
  }finally{restoredLibrary.close();}
  const report={testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,version:JSON.parse(await fs.readFile('package.json','utf8')).version,timedEffects720p:true,frames:120,duration:Number(info.format.duration),pauseResume:paused,absoluteTimeSlice:true,portableRestoredExport:true,cornerBrightness:{before,fade,inside,after},root};
  await fs.writeFile('docs/workflow-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{jobs.close();library.close();}

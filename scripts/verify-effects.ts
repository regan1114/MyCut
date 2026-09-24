import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Library } from '../server/library';
import { renderSegment } from '../server/render';
import { ffmpeg, probe } from '../server/native';
import { audioFeatures } from '../server/rhythm';
import { newProject, makeClip, type FontInfo } from '../shared/model';
import { EFFECT_IDS } from '../shared/effects';
import { Jobs } from '../server/jobs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-effects-test-'));
const fontRoot=path.resolve('public/fonts'),fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
const lib=new Library(root);await lib.init();
try{
 const audio=path.join(root,'beat.wav');await ffmpeg(['-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=5','-af',"volume='if(lt(mod(t,0.5),0.08),4,0)':eval=frame",audio]);const m=await lib.import(audio);
 const analysis=await audioFeatures(lib,m.id);assert.ok(analysis.beats.length>=5,`detected ${analysis.beats.length} onsets`);
 const p=newProject();p.name=`${EFFECT_IDS.length} 種特效實際匯出驗證`;p.effects.enabled=[...EFFECT_IDS];p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:120,color:'#428679'}),makeClip({kind:'text',trackId:'text',start:0,duration:120,text:'MyCut 特效',fontSize:150}),makeClip({kind:'audio',trackId:'music',mediaId:m.id,start:0,duration:120})];
 const settings={resolution:720 as const,quality:'high' as const,encoder:'libx264' as const};const assets=path.join(root,'assets');const options={size:{width:320,height:180}};
 await renderSegment(p,lib,fonts,fontRoot,0,90,settings,path.join(root,'full.mov'),assets,options);
 await renderSegment(p,lib,fonts,fontRoot,45,90,settings,path.join(root,'tail.mov'),assets,options);
 const info=await probe(path.join(root,'full.mov'));assert.equal(info.streams.find((s:any)=>s.codec_type==='video').nb_frames,'90');assert.ok(Math.abs(+info.format.duration-3)<.04);
 async function rawFrame(file:string,time:number,name:string,blur=false){const raw=path.join(root,name+'.rgb');await ffmpeg(['-ss',String(time),'-i',file,'-frames:v','1',...(blur?['-vf','gblur=sigma=1']:[]),'-f','rawvideo','-pix_fmt','rgb24',raw]);return fs.readFile(raw);}
 const a=await rawFrame(path.join(root,'full.mov'),1.5,'full'),b=await rawFrame(path.join(root,'tail.mov'),0,'tail');assert.equal(a.length,320*180*3);const difference=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;// Grain and print dots add high-frequency codec noise. Check both raw RGB and
 // low-frequency geometry; exact pre-encode pixels are covered with reused canvases.
 assert.ok(difference<8,`segment seam RGB difference ${difference}`);
 const smoothA=await rawFrame(path.join(root,'full.mov'),1.5,'smooth-full',true),smoothB=await rawFrame(path.join(root,'tail.mov'),0,'smooth-tail',true);
 const smoothDifference=smoothA.reduce((sum,v,i)=>sum+Math.abs(v-smoothB[i]),0)/smoothA.length;assert.ok(smoothDifference<4,`segment seam geometry difference ${smoothDifference}`);assert.ok(a.some(v=>v>200));
 await ffmpeg(['-ss','2.4','-i',path.join(root,'full.mov'),'-frames:v','1',path.join(root,'effects.png')]);
 const controller=new AbortController();await assert.rejects(()=>renderSegment(p,lib,fonts,fontRoot,0,120,settings,path.join(root,'canceled.mov'),assets,{...options,signal:controller.signal,onProgress:()=>controller.abort()}),/暫停|SIGTERM|aborted|EPIPE|premature/i);assert.ok(!(await fs.readdir(assets)).some(n=>n.startsWith('fx-')),'canceled segment temporary files must be removed');
 // Exercise real job persistence, pause and continuation with 720p effects.
 p.clips.push(makeClip({kind:'shape',trackId:'overlay',start:30,duration:30,scale:.1}));
 const jobs=new Jobs(path.join(root,'exports'),lib,fonts,fontRoot);await jobs.init();const job=await jobs.create(p,settings);let paused=false;const deadline=Date.now()+180000;
 while(!['completed','failed'].includes(job.status)){
   await new Promise(r=>setTimeout(r,100));if(!paused&&job.completedSegments>=1&&job.status==='running'){await jobs.pause(job.id);while(jobs.isRunning)await new Promise(r=>setTimeout(r,50));assert.equal(job.status,'paused');await jobs.resume(job.id);paused=true;}
   if(Date.now()>deadline)throw new Error('Effects export timed out');
 }
 assert.equal(job.status,'completed',job.error);assert.ok(paused);const final=await probe(path.join(jobs.dir(job),'output.mp4'));assert.equal(final.streams.find((s:any)=>s.codec_type==='video').nb_frames,'120');assert.ok(Math.abs(+final.streams.find((s:any)=>s.codec_type==='audio').duration-4)<.05);jobs.close();
 const result={version:JSON.parse(await fs.readFile('package.json','utf8')).version,testedAt:new Date().toISOString(),success:true,effects:EFFECT_IDS.length,onsets:analysis.beats.length,segmentDifference:difference,segmentBlurredDifference:smoothDifference,pauseResume:true,frames:120,resolution:'1280×720',audioDuration:4,root};await fs.writeFile('docs/effects-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{lib.close();}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { newProject, makeClip, ProjectSchema, type Media } from '../shared/model';
import { addLogo, logoPlacement, logoPosition } from '../shared/logos';
import { projectMediaIds, removeProjectMedia } from '../shared/project-media';
import { Library } from '../server/library';
import { Projects } from '../server/projects';
import { PortableProjects } from '../server/portable';
import { importLogo } from '../server/logos';
import { renderSegment } from '../server/render';
import { ffmpeg } from '../server/native';

test('logo corners respect aspect ratio, safe margins and project duration',()=>{
 for(const [width,height] of [[1920,1080],[1080,1920]])for(const [mw,mh] of [[400,100],[100,400]]){
  const p={...newProject(),width,height},m={id:crypto.randomUUID(),kind:'image',name:'Logo',width:mw,height:mh,hasAudio:false,duration:5,size:100} as Media;p.logoMediaIds=[m.id];p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:60})];
  for(const corner of ['top-left','top-right','bottom-left','bottom-right'] as const){const t=logoPlacement(p,m,corner,.15),fit=Math.min(width/mw,height/mh)*t.scale;assert.ok(Math.abs(t.x)+mw*fit/width/2<=.470001);assert.ok(Math.abs(t.y)+mh*fit/height/2<=.470001);assert.equal(logoPosition(p,m,t),corner);const result=addLogo(p,m,t),c=result.project.clips.find(c=>c.id===result.clipId)!;assert.equal(c.duration,60);assert.equal(c.start,0);assert.equal(c.logo,true);assert.equal(result.project.tracks[0].id,c.trackId);}
  assert.equal(logoPosition(p,m,{x:0,y:0,scale:.15}),'custom');assert.ok(projectMediaIds(p).includes(m.id));assert.deepEqual(removeProjectMedia(p,m.id).logoMediaIds,[]);
 }
 const legacy={...newProject()} as any;delete legacy.logoMediaIds;assert.deepEqual(ProjectSchema.parse(legacy).logoMediaIds,[]);
});

test('logo bytes remain owned, survive reopen and travel with unused portable assets; corners export above video with transparency',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-logo-')),library=new Library(path.join(root,'source')),target=new Library(path.join(root,'target'));await library.init();await target.init();
 try{
  const canvas=createCanvas(64,32),ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,64,32);ctx.clearRect(24,8,16,16);const bytes=canvas.toBuffer('image/png'),source=path.join(root,'logo.png');await fs.writeFile(source,bytes);
  const p={...newProject(),width:320,height:180},projects=new Projects(library.root,library);await projects.save(p);
  const m=await importLogo(library,p.id,await fs.readFile(source),'../logo.png');await projects.addLogo(p.id,m.id);await fs.rm(source);
  assert.equal(path.dirname(m.path),path.join(library.root,'projects',p.id,'logos'));assert.equal(m.owned,true);assert.deepEqual(await fs.readFile(m.path),bytes);
  const reopened=new Library(library.root);await reopened.init();assert.equal(reopened.get(m.id).missing,false);reopened.close();const saved=await projects.read(p.id);assert.deepEqual(saved.logoMediaIds,[m.id]);
  const pack=path.join(root,'logos.mycutpack');await new PortableProjects(library,projects).export(saved,pack);const restored=await new PortableProjects(target,new Projects(target.root,target)).import(pack);assert.equal(restored.clips.length,0);assert.equal(restored.logoMediaIds.length,1);const imported=target.get(restored.logoMediaIds[0]);assert.notEqual(imported.id,m.id);assert.equal(path.dirname(imported.path),path.join(target.root,'projects',restored.id,'logos'));assert.deepEqual(await fs.readFile(imported.path),bytes);
  saved.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:30,scale:4,color:'#123456'})];const withLogo=addLogo(saved,m,logoPlacement(saved,m,'top-right',.15)).project;
  const movie=path.join(root,'logo.mov');await renderSegment(withLogo,library,[],path.resolve('public/fonts'),0,1,{resolution:720,quality:'high',encoder:'libx264'},movie,path.join(root,'assets'),{size:{width:320,height:180}});
  const frame=path.join(root,'frame.png');await ffmpeg(['-i',movie,'-frames:v','1',frame]);const image=await loadImage(frame),out=createCanvas(320,180),oc=out.getContext('2d');oc.drawImage(image,0,0);const red=oc.getImageData(267,10,1,1).data,transparent=oc.getImageData(286,17,1,1).data;assert.ok(red[0]>150&&red[1]<80);assert.ok(transparent[2]>transparent[0]+30,'transparent hole shows underlying video');
  await assert.rejects(importLogo(library,'../outside',bytes,'logo.png'));await assert.rejects(importLogo(library,p.id,Buffer.from('not an image'),'fake.png'),/PNG/);const corrupt=Buffer.from(bytes.subarray(0,8));await assert.rejects(importLogo(library,p.id,corrupt,'broken.png'));assert.equal((await fs.readdir(path.dirname(m.path))).length,1);
 }finally{library.close();target.close();await fs.rm(root,{recursive:true,force:true});}
});

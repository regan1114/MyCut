import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { defaultEffects, EFFECT_IDS, renderEffects, type Effects } from '../shared/effects';
import { newProject, makeClip, ProjectSchema } from '../shared/model';
import { sampleRhythm } from '../shared/rhythm';
const fonts=JSON.parse(fs.readFileSync('public/fonts/manifest.json','utf8'));GlobalFonts.registerFromPath(path.resolve('public/fonts',fonts.find((f:any)=>f.id==='notosanstc').file),'Noto Sans TC');
const source=createCanvas(320,180),sc=source.getContext('2d');sc.fillStyle='#25485f';sc.fillRect(0,0,320,180);sc.fillStyle='#edc886';sc.fillRect(40,30,120,100);sc.fillStyle='#ef7492';sc.fillRect(240,120,50,30);
function frame(e:Effects,time:number){const out=createCanvas(320,180),scratch=createCanvas(320,180),ctx=out.getContext('2d');ctx.drawImage(source,0,0);renderEffects(ctx as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,320,180,time,e,{energy:.75,pulse:.85,events:[{time:time-.3,strength:1,key:17}],bands:Array(32).fill(.7),waveform:Array.from({length:32},(_,i)=>Math.sin(i)*.8)},scratch.getContext('2d') as unknown as CanvasRenderingContext2D);return out.data();}
test('legacy projects open with no effects; enabled effects survive validation and JSON round-trip',()=>{const p=newProject();const {effects,...old}=p;assert.deepEqual(ProjectSchema.parse(old).effects.enabled,[]);p.effects.enabled=[...EFFECT_IDS];assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))).effects,p.effects);assert.equal(ProjectSchema.safeParse({...p,effects:{...p.effects,speed:Infinity}}).success,false);});
test('all 40 effects visibly render and seeking to one-hour frames is deterministic',()=>{for(const id of EFFECT_IDS){const e={...defaultEffects(),enabled:[id],intensity:1};const a=frame(e,2.4);assert.notDeepEqual(a,source.data(),id);const late=frame(e,3599.8);frame(e,7);assert.deepEqual(frame(e,3599.8),late,`${id}: seeking / segment continuation`);}assert.deepEqual(frame({...defaultEffects(),enabled:['sakura'],intensity:0},2),source.data());});
test('rhythm respects source trim, speed, fades and hidden/muted tracks',()=>{
 const p=newProject(),id=crypto.randomUUID();p.clips=[makeClip({kind:'audio',trackId:'music',mediaId:id,start:90,duration:90,sourceIn:2,speed:2,volume:.5})];const data=new Map([[id,{energy:new Uint8Array(500).fill(150),beats:[1,2,4,6],bands:new Uint8Array(500*32).fill(204),waveform:new Uint8Array(500*32).fill(255)}]]);
 const rhythm=sampleRhythm(p,4,data);assert.equal(rhythm.pulse,.5);assert.equal(rhythm.bands![0],.4);assert.equal(rhythm.waveform![0],.5);assert.ok(rhythm.events.some(e=>e.time===4));assert.ok(rhythm.events.every(e=>e.time>=3));assert.equal(sampleRhythm(p,2,data).energy,0);
 p.tracks.find(t=>t.id==='music')!.muted=true;assert.deepEqual(sampleRhythm(p,4,data),{energy:0,pulse:0,events:[],bands:Array(32).fill(0),waveform:Array(32).fill(0)});p.tracks.find(t=>t.id==='music')!.muted=false;p.clips[0].volume=0;assert.equal(sampleRhythm(p,4,data).pulse,0);
});

test('new effects remain deterministic at density/quality extremes and zero strength is transparent',()=>{
 for(const id of EFFECT_IDS.slice(28))for(const quality of ['draft','high'] as const)for(const density of [.25,2]){
  const e={...defaultEffects(),enabled:[id],intensity:1,quality,density};
  assert.deepEqual(frame(e,3600),frame(e,3600),`${id}/${quality}/${density}`);
  assert.deepEqual(frame({...e,intensity:0},3600),source.data(),`${id}: disabled strength`);
 }
});

test('beat rays request real audio analysis, remain silent without beats and obey timed track visibility',async()=>{
 const {projectNeedsRhythm,effectLayersAt}=await import('../shared/effect-timeline');
 const p=newProject(),e={...defaultEffects(),enabled:['beatRays'] as Effects['enabled']};
 p.tracks.unshift({id:'effects',name:'特效',kind:'effect',muted:false,hidden:false,locked:false});
 p.clips=[makeClip({kind:'effect',trackId:'effects',start:30,duration:60,effects:e})];
 assert.equal(projectNeedsRhythm(p),true);assert.equal(effectLayersAt(p,29).length,0);assert.equal(effectLayersAt(p,30).length,1);assert.equal(effectLayersAt(p,90).length,0);
 const track=p.tracks.find(t=>t.id==='effects')!;track.hidden=true;assert.equal(projectNeedsRhythm(p),false);assert.equal(effectLayersAt(p,30).length,0);
 const out=createCanvas(320,180),ctx=out.getContext('2d');ctx.drawImage(source,0,0);
 renderEffects(ctx as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,320,180,3600,e);
 assert.deepEqual(out.data(),source.data());
});

test('graphic effects bound high-resolution readback and restore canvas state',()=>{
 const W=1920,H=1080,out=createCanvas(W,H),ctx=out.getContext('2d'),scratch=createCanvas(W,H),sc=scratch.getContext('2d');
 const readback=sc.getImageData.bind(sc),reads:number[][]=[];
 sc.getImageData=((x:number,y:number,w:number,h:number)=>{reads.push([w,h]);return readback(x,y,w,h);}) as typeof sc.getImageData;
 ctx.globalAlpha=.8;ctx.imageSmoothingEnabled=true;sc.globalAlpha=.6;sc.fillStyle='#ddccbb';
 const e={...defaultEffects(),enabled:['pixelate','halftone'] as Effects['enabled'],quality:'high' as const,density:2};
 renderEffects(ctx as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,W,H,3600,e,undefined,sc as unknown as CanvasRenderingContext2D);
 assert.equal(reads.length,1);assert.ok(reads[0].every(v=>v<=96));assert.ok(Math.abs(ctx.globalAlpha-.8)<.01);assert.equal(ctx.imageSmoothingEnabled,true);assert.ok(Math.abs(sc.globalAlpha-.6)<.01);assert.equal(sc.fillStyle,'#ddccbb');
});

test('reusing compositor canvases with all effects preserves exact pixels after seeking',()=>{
 const out=createCanvas(320,180),scratch=createCanvas(320,180),ctx=out.getContext('2d'),e={...defaultEffects(),enabled:[...EFFECT_IDS]};
 const draw=(time:number)=>{ctx.clearRect(0,0,320,180);ctx.drawImage(source,0,0);renderEffects(ctx as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,320,180,time,e,{energy:.7,pulse:.85,events:[{time:time-.3,strength:1,key:17}],bands:Array(32).fill(.7),waveform:Array(32).fill(.2)},scratch.getContext('2d') as unknown as CanvasRenderingContext2D);return Buffer.from(out.data());};
 const at=draw(3599.8);draw(7);assert.deepEqual(draw(3599.8),at);
});

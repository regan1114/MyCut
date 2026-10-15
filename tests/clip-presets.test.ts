import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClipPresets } from '../server/clip-presets';
import { clipSettings, presetPatch, type ClipPreset } from '../shared/clip-presets';
import { makeClip, newProject, uid } from '../shared/model';
import { patchInspectorClip } from '../shared/editing';

test('recent settings survive reload, serialize concurrent edits and keep 50 distinct clips',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-presets-'));
  try{
    let store=new ClipPresets(root);await store.init();assert.deepEqual(store.get(),[]);
    const projectId=uid(),clip=makeClip({kind:'text',trackId:'text',start:10,duration:90,text:'private contents',scale:1.5});
    await Promise.all([store.save({projectId,clip,fps:30}),store.save({projectId,clip:{...clip,scale:2},fps:30})]);
    assert.equal(store.get().length,1);const id=store.get()[0].id;
    store=new ClipPresets(root);await store.init();assert.equal(store.get()[0].settings.scale,2);assert.equal(store.get()[0].id,id);
    for(const key of ['text','start','duration','trackId','mediaId'])assert.ok(!(key in store.get()[0].settings));
    await Promise.all(Array.from({length:51},(_,i)=>store.save({projectId,clip:{...clip,id:uid(),name:String(i)},fps:30})));
    assert.equal(store.get().length,50);assert.equal(store.get()[0].name,'50');
    assert.throws(()=>store.save({projectId,clip:{...clip,scale:99},fps:30}));assert.equal(store.get().length,50);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('applying appearance keeps cue contents, timing and karaoke word alignment and respects track styles',()=>{
  const p=newProject(),source=makeClip({kind:'text',trackId:'text',start:0,duration:100,scale:2,fontSize:100,karaoke:{enabled:true,color:'#123456',words:[{text:'source',start:0,end:10}],offset:0,source:'manual'}}),target=makeClip({kind:'text',trackId:'text',start:20,duration:60,text:'target',karaoke:{enabled:false,color:'#ffffff',words:[{text:'target',start:0,end:20}],offset:3,source:'manual'}});
  const preset:ClipPreset={id:uid(),projectId:p.id,clipId:source.id,kind:source.kind,name:source.name,fps:30,settings:clipSettings(source),updatedAt:''};p.clips=[target];
  const result=patchInspectorClip(p,target.id,presetPatch(preset,target,p.fps),[],20).clips[0];
  assert.equal(result.scale,2);assert.equal(result.fontSize,100);assert.equal(result.text,'target');assert.equal(result.start,20);assert.equal(result.duration,60);assert.deepEqual(result.karaoke.words,target.karaoke.words);assert.equal(result.karaoke.offset,3);assert.equal(result.karaoke.color,'#123456');
  assert.throws(()=>presetPatch(preset,makeClip({kind:'audio',mediaId:uid(),trackId:'music',start:0,duration:60}),30));
});

test('animation and fades convert frame rates, clamp to target length and speed preserves source duration',()=>{
  const p=newProject(),source=makeClip({kind:'video',mediaId:uid(),trackId:'main',start:0,duration:300,speed:2,fadeIn:90,audioFadeOut:150,keyframes:[{frame:0,x:0,y:0,scale:1,opacity:1},{frame:100,x:1,y:0,scale:2,opacity:1},{frame:200,x:2,y:0,scale:3,opacity:1}]}),target=makeClip({kind:'video',mediaId:uid(),trackId:'main',start:0,duration:120});
  const preset:ClipPreset={id:uid(),projectId:p.id,clipId:source.id,kind:source.kind,name:source.name,fps:60,settings:clipSettings(source),updatedAt:''};
  const fields=presetPatch(preset,target,30);assert.equal(fields.fadeIn,45);assert.equal(fields.audioFadeOut,60);assert.deepEqual(fields.keyframes?.map(k=>k.frame),[0,50,59]);
  p.clips=[target];const result=patchInspectorClip(p,target.id,fields,[],0);assert.equal(result.clips[0].duration,60);assert.equal(result.clips[0].speed,2);assert.equal(result.clips[0].mediaId,target.mediaId);
});

test('outline settings sync across a text track and can be reused while legacy projects default to no outline',()=>{
  const p=newProject();p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:60}),makeClip({kind:'text',trackId:'text',start:60,duration:60})];
  assert.equal(p.clips[0].textOutline,0);const edited=patchInspectorClip(p,p.clips[0].id,{textOutline:4},[],0);assert.ok(edited.clips.every(c=>c.textOutline===4));assert.equal(edited.tracks[0].textStyle?.textOutline,4);
  const settings=clipSettings(edited.clips[0]);assert.equal(settings.textOutline,4);
  const preset:ClipPreset={id:uid(),projectId:p.id,clipId:p.clips[0].id,kind:'text',name:'Outline',fps:30,settings,updatedAt:''};assert.equal(presetPatch(preset,p.clips[1],30).textOutline,4);
});

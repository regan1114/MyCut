import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject, ProjectSchema, uid, type Clip, type Project } from '../shared/model';
import { compatibleTrack, dissolveClip, moveSelection, patchInspectorClip, patchLinkedClip, trimSelection } from '../shared/editing';
import { insertTimedClips, consolidateAudioTracks, overlaps } from '../shared/placement';
import { applyCaptionBatch } from '../shared/caption-batch';
import { applyCaptions, audioSignature, type CaptionJob } from '../shared/captions';

function captions(){
  const p=newProject();p.tracks.push({...p.tracks[0],id:'other-text',manualTextLane:true});
  p.clips=['甲','乙','丙'].map((text,i)=>makeClip({kind:'text',trackId:i===2?'other-text':'text',start:i===1?90:0,duration:60,text,
    karaoke:{enabled:false,color:'#ffe27a',offset:i,source:'manual',words:[{text,start:i+5,end:i+50}]}}));
  return p;
}
const cueData=(c:Clip)=>({id:c.id,text:c.text,start:c.start,duration:c.duration,words:c.karaoke.words,offset:c.karaoke.offset,source:c.karaoke.source});
const clear=(p:Project)=>{for(const c of p.clips)for(const other of p.clips)if(c.id!==other.id&&c.trackId===other.trackId)assert.equal(overlaps(c,other),false);};

test('all inspector text appearance is track scoped, saved, and inherited without changing cue data',()=>{
  const p=captions(),before=structuredClone(p),style={fontId:'huninn',fontSize:88,color:'#123456',x:.2,y:.3,scale:1.5,rotation:15,opacity:.7,flipX:true,flipY:true,fit:'cover' as const,crop:.1};
  let edited=patchInspectorClip(p,p.clips[1].id,style,[],90);
  assert.deepEqual(p,before);assert.deepEqual(edited.clips[2],p.clips[2]);
  for(const c of edited.clips.slice(0,2)){for(const [key,value] of Object.entries(style))assert.equal(c[key as keyof Clip],value);}
  assert.deepEqual(edited.clips.map(cueData),p.clips.map(cueData));
  edited=ProjectSchema.parse(JSON.parse(JSON.stringify(edited)));
  const added=insertTimedClips(edited,[makeClip({kind:'text',trackId:'text',start:180,duration:60,text:'新增'})]);
  for(const [key,value] of Object.entries(style))assert.equal(added.clips.at(-1)![key as keyof Clip],value);
  const other=patchInspectorClip(added,p.clips[2].id,{fontSize:30,y:-.3},[],0);
  assert.deepEqual(other.clips.filter(c=>c.trackId==='text'),added.clips.filter(c=>c.trackId==='text'));
});

test('karaoke appearance is shared but text edits and word timing stay with each cue',()=>{
  const p=captions();let edited=patchInspectorClip(p,p.clips[0].id,{karaoke:{...p.clips[0].karaoke,enabled:true,color:'#aabbcc'}},[],0);
  for(const c of edited.clips.slice(0,2)){assert.equal(c.karaoke.enabled,true);assert.equal(c.karaoke.color,'#aabbcc');}
  assert.deepEqual(edited.clips.map(cueData),p.clips.map(cueData));assert.deepEqual(edited.clips[2],p.clips[2]);
  edited=patchInspectorClip(edited,p.clips[0].id,{text:'修改文字'},[],0);
  assert.equal(edited.clips[0].karaoke.enabled,false);assert.equal(edited.clips[1].karaoke.enabled,true);assert.equal(edited.clips[1].text,'乙');
});

test('batch style updates the selected tracks and survives subsequent movement and insertion',()=>{
  let p=captions();p=patchInspectorClip(p,p.clips[0].id,{fontSize:80},[],0);
  const result=applyCaptionBatch(p,[p.clips[1].id],{find:'',replace:'',punctuation:'keep',lineLength:0,style:{fontId:'huninn',fontSize:44,color:'#aabbcc'}});
  assert.deepEqual(result.clips[2],p.clips[2]);assert.deepEqual(result.clips.map(cueData),p.clips.map(cueData));
  assert.deepEqual(result.clips.slice(0,2).map(c=>c.fontSize),[44,44]);
  const moved=moveSelection(result,[p.clips[1].id],15);assert.equal(moved.clips[1].fontSize,44);
  const added=insertTimedClips(moved,[makeClip({kind:'text',trackId:'text',start:180,duration:30})]);assert.equal(added.clips.at(-1)!.fontSize,44);
});

test('moving or trimming within a styled track preserves clip animation',()=>{
  let p=captions();p=patchInspectorClip(p,p.clips[0].id,{x:.25},[],0);
  p.clips[1].keyframes=[{frame:0,x:0,y:0,scale:1,opacity:1},{frame:60,x:1,y:0,scale:1,opacity:1}];
  const moved=moveSelection(p,[p.clips[1].id],30);assert.deepEqual(moved.clips[1].keyframes,p.clips[1].keyframes);
  const trimmed=trimSelection(p,[p.clips[1].id],'right',30,[]);assert.deepEqual(trimmed.clips[1].keyframes,p.clips[1].keyframes);
});

test('an unstyled text lane never migrates into another independently styled track on a timing edit',()=>{
  let p=captions();p.tracks[3].manualTextLane=false;p=patchInspectorClip(p,p.clips[0].id,{fontSize:100},[],0);
  const moved=moveSelection(p,[p.clips[2].id],180);
  assert.equal(moved.clips[2].trackId,'other-text');assert.equal(moved.clips[2].fontSize,p.clips[2].fontSize);
});

test('video and images share lanes; audio overlaps stay timed on audio lanes through move trim and speed',()=>{
  const p=newProject(),mediaId=uid();p.clips=[makeClip({kind:'video',mediaId,trackId:'main',start:0,duration:90}),makeClip({kind:'image',mediaId,trackId:'main',start:120,duration:90}),makeClip({kind:'audio',mediaId,trackId:'music',start:0,duration:90}),makeClip({kind:'audio',mediaId,trackId:'music',start:120,duration:90})];
  for(const index of [1,3]){
    const moved=moveSelection(p,[p.clips[index].id],-90);assert.equal(moved.clips[index].start,30);assert.notEqual(moved.clips[index].trackId,p.clips[index].trackId);clear(moved);
    assert.equal(moved.tracks.find(t=>t.id===moved.clips[index].trackId)!.kind,index===1?'video':'audio');
    const back=moveSelection(moved,[p.clips[index].id],90);assert.equal(back.clips[index].trackId,p.clips[index].trackId);assert.equal(back.tracks.length,p.tracks.length);clear(back);
  }
  const trimmed=trimSelection(p,[p.clips[0].id],'right',90,[]);assert.equal(trimmed.clips[0].duration,180);clear(trimmed);
  const slow=patchLinkedClip(p,p.clips[0].id,{speed:.5},[]);assert.equal(slow.clips[0].duration,180);clear(slow);
  assert.equal(compatibleTrack('image',p.tracks[1]),true);assert.equal(compatibleTrack('video',p.tracks[0]),false);assert.equal(compatibleTrack('audio',p.tracks[1]),false);
});

test('legacy voice/music migration preserves timings and volume, and honors independent mute controls',()=>{
  const p=newProject();p.tracks.push({...p.tracks[2],id:'voice',name:'人聲'});
  p.clips=[makeClip({kind:'audio',mediaId:uid(),trackId:'music',start:0,duration:120,volume:.4}),makeClip({kind:'audio',mediaId:uid(),trackId:'voice',start:60,duration:120,volume:.8})];
  const merged=consolidateAudioTracks(p);clear(merged);assert.deepEqual(merged.clips.map(c=>({...c,trackId:''})),p.clips.map(c=>({...c,trackId:''})));
  assert.deepEqual(consolidateAudioTracks(merged),merged);
  p.tracks[3].muted=true;const muted=consolidateAudioTracks(p);assert.deepEqual(muted.clips,p.clips);assert.equal(muted.tracks.find(t=>t.id==='voice')!.muted,true);
});

test('visual overlaps stay above their source so a dissolve is not hidden by the preceding image',()=>{
  const p=newProject();p.tracks.splice(1,0,{...p.tracks[1],id:'overlay'});
  p.clips=[makeClip({kind:'image',mediaId:uid(),trackId:'overlay',start:0,duration:90}),makeClip({kind:'image',mediaId:uid(),trackId:'overlay',start:90,duration:90})];
  const result=dissolveClip(p,p.clips[1].id),next=result.clips.find(c=>c.id===p.clips[1].id)!;
  assert.equal(next.start,75);assert.equal(next.fadeIn,15);clear(result);
  assert.ok(result.tracks.findIndex(t=>t.id===next.trackId)<result.tracks.findIndex(t=>t.id==='overlay'));
});

test('reapplying recognized captions preserves their independently configured tracks',()=>{
  let p=newProject();const job:CaptionJob={id:uid(),projectId:p.id,name:p.name,fps:p.fps,options:{mode:'captions',language:'zh',traditional:true,vocalFocus:true},signature:audioSignature(p,[]),status:'completed',stage:'done',progress:1,completedChunks:1,totalChunks:1,duration:10,createdAt:'',cueCount:2};
  const cues=[{id:uid(),start:0,duration:90,text:'甲'},{id:uid(),start:30,duration:90,text:'乙'}];
  p=applyCaptions(p,job,cues,[]);p=patchInspectorClip(p,p.clips[1].id,{fontSize:42},[],30);
  const before=p.clips.map(c=>({trackId:c.trackId,fontSize:c.fontSize}));
  const applied=applyCaptions(p,job,cues,[]);assert.deepEqual(applied.clips.map(c=>({trackId:c.trackId,fontSize:c.fontSize})),before);
});

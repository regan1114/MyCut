import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, uid, type Project } from '../shared/model';
import { appendClips, insertTimedClips, overlaps, consolidateTextTracks, pruneEmptyTracks } from '../shared/placement';
import { moveSelection, trimSelection, patchLinkedClip, duplicateSelection, dissolveClip, removeSelection } from '../shared/editing';
const clip=(start:number,duration=90,trackId='text')=>makeClip({kind:'text',trackId,start,duration});
const clear=(p:Project)=>{for(const track of p.tracks){const lane=p.clips.filter(c=>c.trackId===track.id).sort((a,b)=>a.start-b.start);for(let i=1;i<lane.length;i++)assert.ok(!overlaps(lane[i-1],lane[i]),`overlap on ${track.id}`);}};
test('repeated additions append past the complete track, even with playhead in an earlier gap',()=>{let p=newProject();p.clips=[clip(180,30),clip(0,30)];for(let i=0;i<3;i++)p=appendClips(p,[clip(40)]);assert.deepEqual(p.clips.slice(2).map(c=>c.start),[210,300,390]);clear(p);const future=appendClips(p,[clip(600)]);assert.equal(future.clips.at(-1)!.start,600);p.tracks[0].locked=true;assert.throws(()=>appendClips(p,[clip(0)]),/鎖定/);assert.throws(()=>appendClips(newProject(),[clip(86400*30-1,2)]),/24/);});
test('media movement and trim preserve requested timing on automatically added lanes',()=>{
  const p=newProject(),mediaId=uid(),a=makeClip({kind:'video',mediaId,trackId:'main',start:0,duration:90}),b=makeClip({...a,id:uid(),start:120}),c=makeClip({...a,id:uid(),kind:'image',start:240});p.clips=[a,b,c];
  const right=moveSelection(p,[b.id],100);assert.equal(right.clips[1].start,220);assert.notEqual(right.clips[1].trackId,'main');clear(right);
  const left=moveSelection(p,[b.id],-100);assert.equal(left.clips[1].start,20);clear(left);
  const trim=trimSelection(p,[b.id],'right',300,[]);assert.equal(trim.clips[1].duration,390);clear(trim);
  const slow=patchLinkedClip(p,b.id,{speed:.5},[]);assert.equal(slow.clips[1].duration,180);clear(slow);
});
test('linked copies append together; linked movement retains offsets through overlap',()=>{
  const p=newProject(),linkId=uid(),mediaId=uid(),a=makeClip({kind:'video',mediaId,trackId:'main',start:0,duration:90,linkId}),b=makeClip({...a,id:uid(),kind:'audio',trackId:'music',start:30});
  p.clips=[a,b,makeClip({...a,id:uid(),linkId:undefined,start:400,duration:60}),makeClip({...b,id:uid(),linkId:undefined,start:600,duration:60})];
  const copied=duplicateSelection(p,[a.id]);assert.deepEqual(copied.project.clips.slice(-2).map(c=>c.start),[630,660]);assert.notEqual(copied.project.clips.at(-1)!.linkId,linkId);clear(copied.project);
  const moved=moveSelection(p,[a.id],350);assert.deepEqual(moved.clips.slice(0,2).map(c=>c.start),[350,380]);clear(moved);
});
test('timed captions keep timestamps, create clear lanes and preserve locks and track limits',()=>{const p=newProject();p.clips=[clip(0,180)];const a=clip(30),b=clip(60);const inserted=insertTimedClips(p,[a,b]);assert.deepEqual(inserted.clips.slice(-2).map(c=>[c.start,c.duration]),[[30,90],[60,90]]);assert.equal(inserted.tracks.length,p.tracks.length+2);clear(inserted);p.tracks=Array.from({length:32},(_,i)=>({...p.tracks[0],id:i?'lane'+i:'text'}));assert.equal(insertTimedClips(p,[a]).clips.at(-1)!.start,30);p.clips=p.tracks.map(t=>clip(0,180,t.id));assert.throws(()=>insertTimedClips(p,[a]),/32/);assert.equal(p.clips.length,32);});
test('cross dissolve uses separate tracks while retaining the original fade timing',()=>{const p=newProject(),a=clip(0),b=clip(90);p.clips=[a,b];const dissolved=dissolveClip(p,b.id);const next=dissolved.clips.find(c=>c.id===b.id)!;assert.equal(next.start,75);assert.equal(next.fadeIn,15);assert.notEqual(next.trackId,a.trackId);assert.ok(dissolved.tracks.findIndex(t=>t.id===next.trackId)<dissolved.tracks.findIndex(t=>t.id===a.trackId));clear(dissolved);});

test('text moves and trims retain requested timing, reuse overflow lanes, and remove empty lanes',()=>{
  const p=newProject(),a=clip(0,60),b=clip(90,60);p.clips=[a,b];
  const moved=moveSelection(p,[b.id],-60);assert.equal(moved.clips[1].start,30);assert.notEqual(moved.clips[1].trackId,a.trackId);assert.equal(moved.tracks.filter(t=>t.kind==='text').length,2);clear(moved);
  const back=moveSelection(moved,[b.id],60);assert.equal(back.clips[1].start,90);assert.equal(back.clips[1].trackId,a.trackId);assert.equal(back.tracks.filter(t=>t.kind==='text').length,1);
  const trimmed=trimSelection(p,[a.id],'right',60,[]);assert.equal(trimmed.clips[0].duration,120);assert.notEqual(trimmed.clips[0].trackId,b.trackId);clear(trimmed);
  const shortened=trimSelection(trimmed,[a.id],'right',-60,[]);assert.equal(shortened.tracks.filter(t=>t.kind==='text').length,1);assert.equal(shortened.clips[0].duration,60);clear(shortened);
  const later=insertTimedClips(moved,[clip(90,60),clip(120,60)]);assert.equal(later.tracks.filter(t=>t.kind==='text').length,2);clear(later);
  assert.equal(removeSelection(moved,[b.id]).tracks.filter(t=>t.kind==='text').length,1);
});

test('moving the only caption to a manual lane preserves the empty primary lane for the return trip',()=>{
  const p=newProject(),caption=clip(60,60);p.clips=[caption];p.tracks.splice(1,0,{...p.tracks[0],id:'manual',manualTextLane:true});
  const moved=moveSelection(p,[caption.id],0,'manual');
  assert.equal(moved.clips[0].trackId,'manual');assert.deepEqual(moved.tracks,p.tracks);
  const returned=moveSelection(moved,[caption.id],0,'text');
  assert.equal(returned.clips[0].trackId,'text');assert.deepEqual(returned.tracks,newProject().tracks);
});

test('empty manual and media lanes are pruned without moving clips or deleting base and locked lanes',()=>{
  const p=newProject(),before=structuredClone(p);
  p.tracks.unshift({...p.tracks[0],id:'manual',manualTextLane:true,textStyle:{fontSize:80}}, {...p.tracks[1],id:'extra-video'}, {...p.tracks[2],id:'extra-audio'});
  p.tracks.push({...p.tracks[0],id:'locked',locked:true});
  p.clips=[clip(0,60,'manual'),clip(90,60)];
  const cleaned=pruneEmptyTracks(p);assert.deepEqual(cleaned.clips,p.clips);assert.equal(cleaned.tracks.length,5);
  const removed=removeSelection(cleaned,[p.clips[0].id]);assert.deepEqual(removed.tracks.map(t=>t.id),[...before.tracks.map(t=>t.id),'locked']);
  const custom={...before,tracks:before.tracks.map(t=>({...t,id:'custom-'+t.id}))};assert.deepEqual(pruneEmptyTracks(custom),custom);
});

test('older automatic lanes consolidate while manual placement, locks and hidden tracks survive',()=>{
  const p=newProject();p.tracks.unshift({...p.tracks[0],id:'old'});p.clips=[clip(0,60,'old'),clip(60,60),clip(30,60,'old')];
  const result=consolidateTextTracks(p);assert.deepEqual(result.clips.map(c=>c.start),[0,60,30]);assert.equal(result.clips[0].trackId,'text');assert.equal(result.clips[2].trackId,'old');clear(result);
  for(const flag of ['manualTextLane','locked','hidden'] as const){const special={...p,tracks:p.tracks.map(t=>t.id==='old'?{...t,[flag]:true}:t)};assert.equal(consolidateTextTracks(special).clips[0].trackId,'old');}
  const empty={...p,clips:[clip(0,60,'old')]};assert.equal(consolidateTextTracks(empty).tracks.filter(t=>t.kind==='text').length,1);
});

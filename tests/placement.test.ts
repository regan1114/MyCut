import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, uid, type Project } from '../shared/model';
import { appendClips, insertTimedClips, overlaps, consolidateTextTracks } from '../shared/placement';
import { moveSelection, trimSelection, patchLinkedClip, duplicateSelection, dissolveClip, removeSelection } from '../shared/editing';
const clip=(start:number,duration=90,trackId='text')=>makeClip({kind:'text',trackId,start,duration});
const clear=(p:Project)=>{for(const track of p.tracks){const lane=p.clips.filter(c=>c.trackId===track.id).sort((a,b)=>a.start-b.start);for(let i=1;i<lane.length;i++)assert.ok(!overlaps(lane[i-1],lane[i]),`overlap on ${track.id}`);}};
test('repeated additions append past the complete track, even with playhead in an earlier gap',()=>{let p=newProject();p.clips=[clip(180,30),clip(0,30)];for(let i=0;i<3;i++)p=appendClips(p,[clip(40)]);assert.deepEqual(p.clips.slice(2).map(c=>c.start),[210,300,390]);clear(p);const future=appendClips(p,[clip(600)]);assert.equal(future.clips.at(-1)!.start,600);p.tracks[0].locked=true;assert.throws(()=>appendClips(p,[clip(0)]),/鎖定/);assert.throws(()=>appendClips(newProject(),[clip(86400*30-1,2)]),/24/);});
test('non-text moves and trims stop at neighbours; other tracks can play at the same time',()=>{const p=newProject(),a=clip(0,90,'main'),b=clip(120,90,'main'),c=clip(240,90,'main');p.clips=[a,b,c,clip(0,300,'overlay')];const right=moveSelection(p,[b.id],100);assert.equal(right.clips[1].start,150);clear(right);const left=moveSelection(p,[b.id],-100);assert.equal(left.clips[1].start,90);clear(left);assert.equal(trimSelection(p,[b.id],'right',300,[]).clips[1].duration,120);const trim=trimSelection(p,[b.id],'left',-100,[]);assert.equal(trim.clips[1].start,90);assert.equal(trim.clips[1].duration,120);clear(trim);assert.throws(()=>patchLinkedClip(p,b.id,{trackId:'overlay'},[]),/已有片段/);assert.throws(()=>patchLinkedClip(p,b.id,{speed:.5},[]),/重疊/);});
test('linked and grouped copies append together after occupied destination tracks',()=>{const p=newProject(),linkId=uid(),a={...clip(0),linkId},b={...clip(30,90,'overlay'),linkId};p.clips=[a,b,clip(400,60),clip(600,60,'overlay')];const copied=duplicateSelection(p,[a.id]);assert.deepEqual(copied.project.clips.slice(-2).map(c=>c.start),[630,660]);assert.notEqual(copied.project.clips.at(-1)!.linkId,linkId);clear(copied.project);const moved=moveSelection(p,[a.id],350);assert.deepEqual(moved.clips.slice(0,2).map(c=>c.start),[310,340]);clear(moved);});
test('timed captions keep timestamps, create clear lanes and preserve locks and track limits',()=>{const p=newProject();p.clips=[clip(0,180)];const a=clip(30),b=clip(60);const inserted=insertTimedClips(p,[a,b]);assert.deepEqual(inserted.clips.slice(-2).map(c=>[c.start,c.duration]),[[30,90],[60,90]]);assert.equal(inserted.tracks.length,7);clear(inserted);p.tracks=Array.from({length:32},(_,i)=>({...p.tracks[0],id:i?'lane'+i:'text'}));assert.equal(insertTimedClips(p,[a]).clips.at(-1)!.start,30);p.clips=p.tracks.map(t=>clip(0,180,t.id));assert.throws(()=>insertTimedClips(p,[a]),/32/);assert.equal(p.clips.length,32);});
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

test('older automatic lanes consolidate while manual placement, locks and hidden tracks survive',()=>{
  const p=newProject();p.tracks.unshift({...p.tracks[0],id:'old'});p.clips=[clip(0,60,'old'),clip(60,60),clip(30,60,'old')];
  const result=consolidateTextTracks(p);assert.deepEqual(result.clips.map(c=>c.start),[0,60,30]);assert.equal(result.clips[0].trackId,'text');assert.equal(result.clips[2].trackId,'old');clear(result);
  for(const flag of ['manualTextLane','locked','hidden'] as const){const special={...p,tracks:p.tracks.map(t=>t.id==='old'?{...t,[flag]:true}:t)};assert.equal(consolidateTextTracks(special).clips[0].trackId,'old');}
  const empty={...p,clips:[clip(0,60,'old')]};assert.equal(consolidateTextTracks(empty).tracks.filter(t=>t.kind==='text').length,1);
});

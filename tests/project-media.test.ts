import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeClip, newProject, ProjectSchema, uid } from '../shared/model';
import { addProjectMedia, projectMediaIds, removeProjectMedia } from '../shared/project-media';
import { nextProjectName, projectDateName } from '../shared/projects';
import { Library } from '../server/library';
import { Projects } from '../server/projects';

test('project bins retain unused imports, migrate timeline references, and remove only the selected asset',()=>{
  const a=uid(),b=uid(),groupId=uid(),p=newProject();p.clips=[makeClip({kind:'audio',mediaId:a,trackId:'music',start:0,duration:90,groupId}),makeClip({kind:'audio',mediaId:a,trackId:'voice',start:90,duration:60}),makeClip({kind:'text',trackId:'text',start:0,duration:90,groupId})];
  const legacy=ProjectSchema.parse({...p,mediaIds:undefined}),imported=addProjectMedia(legacy,[b,a,b]);
  assert.deepEqual(imported.mediaIds,[a,b]);assert.deepEqual(projectMediaIds(newProject()),[]);
  const removed=removeProjectMedia(imported,a);assert.deepEqual(removed.mediaIds,[b]);assert.deepEqual(removed.clips,[p.clips[2]]);assert.deepEqual(imported.clips,p.clips);
  assert.deepEqual(projectMediaIds(ProjectSchema.parse(JSON.parse(JSON.stringify(removed)))),[b]);
  const locked={...imported,tracks:imported.tracks.map(t=>t.id==='voice'?{...t,locked:true}:t)};assert.throws(()=>removeProjectMedia(locked,a),/解鎖/);assert.deepEqual(removeProjectMedia(locked,b).mediaIds,[a]);
});

test('date names use local year month day and append unused numeric suffixes',()=>{
  const date=new Date(2026,0,2,23,59);assert.equal(projectDateName(date),'20260102');assert.equal(nextProjectName([],date),'20260102');
  assert.equal(nextProjectName(['20260102','20260102_1','20260102_2','20260101_3'],date),'20260102_3');assert.equal(projectDateName(new Date(2026,11,31)),'20261231');
});

test('concurrent new projects have unique date names, reserve trash names, and keep empty independent bins',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-project-names-')),library=new Library(root),projects=new Projects(root,library);
  try{const base=projectDateName(),first=await projects.create(newProject());assert.equal(first.name,base);await projects.move(first.id);
    const created=await Promise.all([projects.create(newProject()),projects.create(newProject())]);assert.deepEqual(created.map(p=>p.name),[base+'_1',base+'_2']);assert.ok(created.every(p=>!p.clips.length&&!p.mediaIds.length));
    await assert.rejects(()=>projects.create(first),/已存在/);await projects.move(first.id,true);assert.equal((await projects.read(first.id)).name,base);
  }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});

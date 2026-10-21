import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const {profilePath}=createRequire(import.meta.url)('../electron/profile.cjs');
test('Reelume preserves legacy profiles without moving absolute media paths or overriding isolated/new profiles',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'reelume-profile-')),current=path.join(root,'Reelume'),legacy=path.join(root,'MyCut');try{assert.equal(profilePath(root,current),current);await fs.mkdir(path.join(legacy,'workspace','projects'),{recursive:true});await fs.writeFile(path.join(legacy,'workspace','projects','keep.json'),'unchanged');assert.equal(profilePath(root,current),legacy);assert.equal(profilePath(root,current,{isolated:true}),current);await fs.mkdir(path.join(current,'workspace','projects'),{recursive:true});assert.equal(profilePath(root,current),current);assert.equal(await fs.readFile(path.join(legacy,'workspace','projects','keep.json'),'utf8'),'unchanged');}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('current visible branding and launchers use Reelume',async()=>{const manifest=JSON.parse(await fs.readFile('package.json','utf8'));assert.equal(manifest.name,'reelume');assert.equal(manifest.build.productName,'Reelume');for(const file of ['index.html','src/components/AppVersion.tsx','src/components/ProjectHome.tsx','src/App.tsx','啟動 Reelume.command','啟動 Reelume.cmd']){const text=await fs.readFile(file,'utf8');assert.match(text,/Reelume/);assert.doesNotMatch(text,/MyCut/);}const main=await fs.readFile('electron/main.cjs','utf8');assert.match(main,/reelumepack/);assert.match(main,/mycutpack/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const {compareVersions,findNewerVersion,readRunningVersion,writeRunningVersion,instanceNotice}=createRequire(import.meta.url)('../electron/version.cjs');

test('version discovery checks numeric ordering, packaged binaries and matching architecture',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-version-'));
 try{
  const base={version:'0.6.9',appPath:root,executable:path.join(root,'release/0.6.9/mac/MyCut.app/Contents/MacOS/MyCut'),platform:'darwin',arch:'x64',packaged:false};
  assert.ok(compareVersions('0.6.24','0.6.9')>0);assert.equal(compareVersions('foo','0.6.9'),0);
  for(const relative of ['0.6.10/mac/MyCut.app/Contents/MacOS/MyCut','0.6.24/mac-arm64/MyCut.app/Contents/MacOS/MyCut','0.6.25/win-unpacked/MyCut.exe']){const file=path.join(root,'release',relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture');}
  await fs.mkdir(path.join(root,'release','1.0.0'));assert.equal(await findNewerVersion(base),'0.6.10');assert.equal(await findNewerVersion({...base,packaged:true,appPath:'ignored.asar'}),'0.6.10');
  assert.equal(await findNewerVersion({...base,arch:'arm64'}),'0.6.24');assert.equal(await findNewerVersion({...base,platform:'win32'}),'0.6.25');assert.equal(await findNewerVersion({...base,version:'0.6.10'}),undefined);
  assert.equal(await findNewerVersion({...base,packaged:true,executable:'/Applications/MyCut.app/Contents/MacOS/MyCut'}),undefined);
  assert.equal(await readRunningVersion(root),undefined);await writeRunningVersion(root,'0.6.24');assert.equal(await readRunningVersion(root),'0.6.24');assert.equal(instanceNotice('0.6.24','0.6.24'),null);assert.match(instanceNotice('0.6.24','0.6.23').message,/0.6.23/);assert.match(instanceNotice('0.6.24',undefined).detail,/完全結束/);
  await fs.writeFile(path.join(root,'running-version.json'),JSON.stringify({version:'0.6.24',pid:2147483647}));assert.equal(await readRunningVersion(root),undefined);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {sha256} from './native-downloads.mjs';
import { verifyBundledFonts } from './verify-bundled-fonts.mjs';
const asar=createRequire(import.meta.url)('@electron/asar');
const reports=[];
for(const arch of ['x64','arm64']){
  const app=path.resolve(`release/${arch==='x64'?'mac':'mac-arm64'}/MyCut.app`);
  if(!await fs.stat(app).catch(()=>null))continue;
  const resources=path.join(app,'Contents/Resources'),unpacked=path.join(resources,'app.asar.unpacked');
  const appManifest=JSON.parse(asar.extractFile(path.join(resources,'app.asar'),'package.json').toString());
  assert.equal(appManifest.version,JSON.parse(await fs.readFile('package.json','utf8')).version);
  const platform=`darwin-${arch}`;
  const binaries=[path.join(app,'Contents/MacOS/MyCut'),path.join(unpacked,'node_modules/ffmpeg-static/ffmpeg'),path.join(unpacked,arch==='arm64'?'node_modules/@ffprobe-installer/darwin-arm64/ffprobe':'node_modules/ffprobe-static/bin/darwin/x64/ffprobe'),path.join(unpacked,`resources/speech/${platform}/whisper-cli`)];
  for(const file of binaries){const b=await fs.readFile(file);assert.equal(b.readUInt32LE(0),0xfeedfacf,file);assert.equal(b.readUInt32LE(4),arch==='x64'?0x01000007:0x0100000c,file);}
  for(const file of binaries){const links=execFileSync('otool',['-L',file],{encoding:'utf8'});assert.ok(!links.includes('/opt/homebrew/')&&!links.includes('/usr/local/'),`Non-system dependency: ${file}`);}
  execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});
  const speech=path.join(unpacked,'resources/speech');
  assert.equal(await sha256(path.join(speech,'ggml-small-q5_1.bin')),'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb');
  assert.deepEqual((await fs.readdir(speech)).filter(n=>n.startsWith('darwin-')||n.startsWith('win32-')),[platform]);
  if(arch==='x64'){assert.deepEqual(await fs.readdir(path.join(unpacked,'node_modules/ffprobe-static/bin')),['darwin']);assert.deepEqual(await fs.readdir(path.join(unpacked,'node_modules/ffprobe-static/bin/darwin')),[arch]);}
  const native=[];
  async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())await walk(file);else if(item.name.endsWith('.node')){const b=await fs.readFile(file);assert.equal(b.readUInt32LE(4),arch==='x64'?0x01000007:0x0100000c,file);native.push(path.relative(app,file));}}}
  await walk(path.join(unpacked,'node_modules'));assert.equal(native.length,2);
  const minimum=execFileSync('/usr/libexec/PlistBuddy',['-c','Print LSMinimumSystemVersion',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();assert.equal(minimum,'14.0');
  assert.match(execFileSync('otool',['-l',binaries[3]],{encoding:'utf8'}),/minos 14\.0/);
  const fontCount=await verifyBundledFonts(unpacked);
  reports.push({arch,version:appManifest.version,minimumMacOS:minimum,binaries:native,modelSha256:'passed',fonts:fontCount,fontHashesAndLicenses:'passed',scope:'Static Mach-O, ASAR, fonts, model and deployment-target checks'});
}
assert.ok(reports.length);await fs.writeFile('docs/mac-packages-test-result.json',JSON.stringify({testedAt:new Date().toISOString(),reports},null,2)+'\n');console.log(JSON.stringify(reports,null,2));

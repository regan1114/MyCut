import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build,Platform,Arch} from 'electron-builder';
import {run} from './native-downloads.mjs';
const require=createRequire(import.meta.url),root=process.cwd();
const target=process.argv[2];if(!['mac','win'].includes(target))throw new Error('Use npm run package:mac or npm run package:win');
if(target==='mac'&&process.platform!=='darwin')throw new Error('Mac 封裝須在 macOS 執行');
const archFlag=process.argv.indexOf('--arch');
const arch=archFlag>=0?process.argv[archFlag+1]:(target==='win'?'x64':process.arch);
if(target==='win'&&arch!=='x64')throw new Error('Windows 目前僅支援 x64');
const platform=target==='win'?'win32':'darwin';
if(!['x64','arm64'].includes(arch))throw new Error('Unsupported architecture');
if(!process.env.npm_execpath)throw new Error('請使用 npm run package:mac / package:win');
const npm=(args,options={})=>run(process.execPath,[process.env.npm_execpath,...args],options);
await npm(['run','build']);
await run(process.execPath,['scripts/install-speech.mjs','--platform',platform,'--arch',arch]);
const config={electronVersion:require('electron/package.json').version};
const manifest=JSON.parse(await fs.readFile('package.json','utf8'));
config.files=[...manifest.build.files];
if(platform==='darwin'&&arch==='arm64')config.files.push('!node_modules/ffprobe-static/bin/**/*');
for(const other of ['darwin','linux','win32']){
  if(other!==platform)config.files.push(`!node_modules/ffprobe-static/bin/${other}/**/*`);
  else for(const otherArch of ['x64','arm64','ia32','arm'])if(otherArch!==arch)config.files.push(`!node_modules/ffprobe-static/bin/${other}/${otherArch}/**/*`);
}
if(target==='win'||arch!==process.arch){
  // Install target-specific prebuilt N-API modules in isolation. Never replace
  // the developer's native modules with another architecture's binaries.
  const stage=path.join(root,'.build-staging',`${platform}-${arch}`);await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(stage,{recursive:true});
  for(const name of ['package.json','package-lock.json','dist','dist-server','electron','public/fonts','THIRD_PARTY_NOTICES.md'])await fs.cp(path.join(root,name),path.join(stage,name),{recursive:true});
  const speech=path.join(stage,'resources/speech');await fs.mkdir(speech,{recursive:true});
  for(const name of await fs.readdir('resources/speech'))if(name===`${platform}-${arch}`||!name.startsWith('darwin-')&&!name.startsWith('win32-'))await fs.cp(path.join(root,'resources/speech',name),path.join(speech,name),{recursive:true});
  await npm(['ci','--omit=dev','--ignore-scripts',`--os=${platform}`,`--cpu=${arch}`,'--no-audit','--no-fund'],{cwd:stage});
  await run(process.execPath,[path.join(stage,'node_modules/ffmpeg-static/install.js')],{cwd:stage,env:{...process.env,npm_config_platform:platform,npm_config_arch:arch}});
  for(const name of [`@napi-rs/canvas-${platform}-${arch}${target==='win'?'-msvc':''}`,`@resvg/resvg-js-${platform}-${arch}${target==='win'?'-msvc':''}`])await fs.access(path.join(stage,'node_modules',name));
  await fs.access(path.join(stage,'node_modules/ffmpeg-static',target==='win'?'ffmpeg.exe':'ffmpeg'));
  if(platform==='darwin'&&arch==='arm64')await fs.chmod(path.join(stage,'node_modules/@ffprobe-installer/darwin-arm64/ffprobe'),0o755);
  const appManifest={...manifest};delete appManifest.build;delete appManifest.devDependencies;delete appManifest.scripts;await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(appManifest,null,2)+'\n');
  config.directories={app:stage,output:path.join(root,'release')};
  config.npmRebuild=false; // N-API binaries are already installed for the target platform.
}else{
  config.electronDist=path.join(root,'node_modules/electron/dist');
  config.files.push('!resources/speech/win32-*/**/*',`!resources/speech/darwin-${arch==='x64'?'arm64':'x64'}/**/*`);
}
const artifacts=await build({projectDir:root,config,targets:(target==='win'?Platform.WINDOWS:Platform.MAC).createTarget(target==='win'?['nsis','zip']:['dir'],arch==='x64'?Arch.x64:Arch.arm64),publish:'never'});
console.log('Package complete:',artifacts.join('\n'));

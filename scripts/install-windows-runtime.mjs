import fs from 'node:fs/promises';
import path from 'node:path';
import {download,extract,sha256} from './native-downloads.mjs';

// Pinned Microsoft v14 redistribution package. Deploy DLLs beside our executables;
// do not modify the system runtime or require an administrator installation.
const url='https://download.visualstudio.microsoft.com/download/pr/ebdab8e5-1d7b-4d9f-a11b-cbb1720c3b12/843068991DAAA1F73AD9F6239BCE4D0F6A07A51F18C37EA2A867E9BECA71295C/VC_redist.x64.exe';
const hash='843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c';
export async function installWindowsRuntime(){
  const cache=path.resolve('vendor/windows-runtime'),destination=path.resolve('resources/windows-runtime/x64');
  const archive=path.join(cache,'VC_redist.x64.exe');await download(url,archive,hash);
  const buffer=await fs.readFile(archive),cabs=[];
  for(let offset=buffer.indexOf('MSCF');offset>=0;offset=buffer.indexOf('MSCF',offset+4)){
    const size=buffer.readUInt32LE(offset+8);
    if(size<36||size>buffer.length-offset)continue;
    const file=path.join(cache,`container-${cabs.length}.cab`);await fs.writeFile(file,buffer.subarray(offset,offset+size));cabs.push(file);
  }
  if(cabs.length!==2)throw new Error('Unexpected Microsoft runtime archive layout');
  const metadata=path.join(cache,'metadata'),payload=path.join(cache,'payload');
  await extract(cabs[0],metadata);await extract(cabs[1],payload);
  const xml=await fs.readFile(path.join(metadata,'0'),'utf8');
  const entry=[...xml.matchAll(/<Payload\s+[^>]*\/>/g)].map(m=>m[0]).find(s=>s.includes('vcRuntimeMinimum_amd64\\cab1.cab'));
  const source=entry?.match(/SourcePath="(a\d+)"/)?.[1];if(!source)throw new Error('Microsoft x64 runtime payload missing');
  const dlls=path.join(cache,'dlls');await extract(path.join(payload,source),dlls);await fs.mkdir(destination,{recursive:true});
  const files=[];
  for(const name of await fs.readdir(dlls))if(name.endsWith('.dll_amd64')){
    const target=path.join(destination,name.replace(/_amd64$/,''));await fs.copyFile(path.join(dlls,name),target);files.push({name:path.basename(target),sha256:await sha256(target)});
  }
  for(const name of ['msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll','vcomp140.dll'])if(!files.some(f=>f.name===name))throw new Error(`Missing ${name}`);
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({source:url,sha256:hash,files},null,2)+'\n');
  await fs.writeFile(path.join(destination,'NOTICE.txt'),'Microsoft Visual C++ v14 Runtime, x64. Copyright Microsoft Corporation.\nRedistribution terms: https://aka.ms/VCRedistLicense\nSource and checksums: manifest.json\n');
  return destination;
}

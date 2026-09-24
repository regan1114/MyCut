import fs from 'node:fs/promises';
import path from 'node:path';
import {download,run,extract,sha256} from './native-downloads.mjs';
const version='1.8.6',hash='ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb';
const requested=process.argv.indexOf('--platform');
const platform=requested>=0?process.argv[requested+1]:process.platform;
const archFlag=process.argv.indexOf('--arch');
const arch=archFlag>=0?process.argv[archFlag+1]:(platform==='win32'?'x64':process.arch);
if(!['x64','arm64'].includes(arch)||platform==='win32'&&arch!=='x64')throw new Error('Unsupported platform architecture');
if(!['darwin','win32'].includes(platform))throw new Error('目前支援 macOS 與 Windows x64');
if(platform==='darwin'&&process.platform!=='darwin')throw new Error('macOS 語音引擎須在 Mac 建置');
const resources=path.resolve('resources/speech'),vendor=path.resolve('vendor');
await fs.mkdir(resources,{recursive:true});await fs.mkdir(vendor,{recursive:true});
const model=path.join(resources,'ggml-small-q5_1.bin');
await download('https://huggingface.co/ggerganov/whisper.cpp/resolve/f281eb45af861ab5e5297d23694b7d46e090c02c/ggml-small-q5_1.bin',model,hash);
const destination=path.join(resources,`${platform}-${arch}`);
await fs.mkdir(destination,{recursive:true});
if(platform==='win32'){
  const archive=path.join(vendor,`whisper-v${version}-win-x64.zip`);
  await download(`https://github.com/ggml-org/whisper.cpp/releases/download/v${version}/whisper-bin-x64.zip`,archive,'b07ea0b1b4115a38e1a7b07debf581f0b77d999925f8acb8f39d322b0ba0a822');
  const unpack=path.join(vendor,`whisper-v${version}-win-x64`);await extract(archive,unpack);
  for(const name of ['whisper-cli.exe','whisper.dll','ggml.dll','ggml-base.dll','ggml-cpu.dll'])await fs.copyFile(path.join(unpack,'Release',name),path.join(destination,name));
  const {enableUtf8Paths}=await import('./windows-manifest.mjs');await enableUtf8Paths(path.join(destination,'whisper-cli.exe'));
  const {installWindowsRuntime}=await import('./install-windows-runtime.mjs');
  const runtime=await installWindowsRuntime();
  for(const name of await fs.readdir(runtime))if(name.endsWith('.dll'))await fs.copyFile(path.join(runtime,name),path.join(destination,name));
}else{
  const archive=path.join(vendor,`whisper-v${version}.tar.gz`),source=path.join(vendor,`whisper.cpp-${version}`),build=path.join(vendor,`whisper-build-${platform}-${arch}`);
  const manifest=JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8').catch(()=>'{}'));
  const binary=path.join(destination,'whisper-cli');
  if(!await fs.stat(binary).catch(()=>null)||manifest.version!==version||manifest.minimumMacOS!=='14.0'||process.argv.includes('--rebuild')){
    if(!await fs.stat(source).catch(()=>null)){await download(`https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v${version}`,archive);await run('tar',['-xzf',archive,'-C',vendor]);}
    const localCmake=path.resolve('.build-tools/cmake/data/bin/cmake');const cmake=process.env.MYCUT_CMAKE||(await fs.stat(localCmake).catch(()=>null)?localCmake:'cmake');
    await run(cmake,['-S',source,'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0',`-DCMAKE_OSX_ARCHITECTURES=${arch==='x64'?'x86_64':'arm64'}`,'-DBUILD_SHARED_LIBS=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_EXAMPLES=ON','-DGGML_METAL=OFF','-DGGML_NATIVE=OFF','-DGGML_OPENMP=OFF']);
    await run(cmake,['--build',build,'--config','Release','--target','whisper-cli','--parallel','4']);
    await fs.copyFile(path.join(build,'bin','whisper-cli'),binary);await fs.chmod(binary,0o755);
  }
}
await download(`https://raw.githubusercontent.com/ggml-org/whisper.cpp/v${version}/LICENSE`,path.join(resources,'whisper-LICENSE.txt'));
await download('https://raw.githubusercontent.com/openai/whisper/main/LICENSE',path.join(resources,'model-LICENSE.txt'));
await fs.writeFile(path.join(resources,'manifest.json'),JSON.stringify({engine:'whisper.cpp',version,engineSource:`https://github.com/ggml-org/whisper.cpp/tree/v${version}`,model:'ggml-small-q5_1.bin',modelBytes:190085487,modelSha256:hash,modelSource:'https://huggingface.co/ggerganov/whisper.cpp',license:'MIT'},null,2)+'\n');
const executable=path.join(destination,platform==='win32'?'whisper-cli.exe':'whisper-cli');
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({platform,arch,version,sha256:await sha256(executable),utf8Manifest:platform==='win32',...(platform==='win32'?{cpu:'x64, AVX2',runtime:'Microsoft Visual C++ v14, app-local'}:{minimumMacOS:'14.0'})},null,2)+'\n');
console.log(`Offline speech engine ready: ${executable}`);

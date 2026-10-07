const fs=require('node:fs/promises');
const path=require('node:path');
const parts=value=>/^\d+\.\d+\.\d+$/.test(value)?value.split('.').map(Number):null;
function compareVersions(a,b){const x=parts(a),y=parts(b);if(!x||!y)return 0;for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
async function findNewerVersion({version,appPath,executable,packaged,platform,arch}){
  let release=path.join(appPath,'release');
  if(packaged){
    let dir=path.dirname(executable);release=undefined;
    while(path.dirname(dir)!==dir){if(path.basename(dir)==='release'){release=dir;break;}dir=path.dirname(dir);}
  }
  if(!release)return;
  const names=await fs.readdir(release).catch(()=>[]);
  const candidates=names.filter(name=>parts(name)&&compareVersions(name,version)>0).sort((a,b)=>compareVersions(b,a));
  const binary=platform==='darwin'?path.join(arch==='arm64'?'mac-arm64':'mac','MyCut.app','Contents','MacOS','MyCut'):platform==='win32'?path.join(arch==='arm64'?'win-arm64-unpacked':'win-unpacked','MyCut.exe'):undefined;
  if(!binary)return;
  for(const candidate of candidates)if((await fs.stat(path.join(release,candidate,binary)).catch(()=>null))?.isFile())return candidate;
}
const recordFile=userData=>path.join(userData,'running-version.json');
async function readRunningVersion(userData){try{const {version,pid}=JSON.parse(await fs.readFile(recordFile(userData),'utf8'));if(!Number.isInteger(pid)||pid<=0)return;process.kill(pid,0);return typeof version==='string'&&parts(version)?version:undefined;}catch{return undefined;}}
async function writeRunningVersion(userData,version){await fs.mkdir(userData,{recursive:true});const file=recordFile(userData);await fs.writeFile(file+'.tmp',JSON.stringify({version,pid:process.pid}));await fs.rename(file+'.tmp',file);}
function instanceNotice(version,running){return running===version?null:{type:'info',title:'MyCut 已在執行',message:running?`目前執行的是 MyCut ${running}`:'另一個 MyCut 已在執行',detail:`本次開啟的是 ${version}。請先儲存專案，完全結束目前的 MyCut，再開啟這個版本。關閉視窗可能只會返回專案首頁。`,buttons:['知道了']};}
module.exports={compareVersions,findNewerVersion,readRunningVersion,writeRunningVersion,instanceNotice};

const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const specs={codex:{name:'Codex',package:'@openai/codex'},claude:{name:'Claude Code',package:'@anthropic-ai/claude-code'},gemini:{name:'Gemini CLI',package:'@google/gemini-cli'}};
async function exists(file){try{return (await fs.stat(file)).isFile();}catch{return false;}}
async function directories(){
 const home=os.homedir(),dirs=(process.env.PATH||'').split(path.delimiter).filter(p=>path.isAbsolute(p));
 dirs.push(path.join(home,'.local','bin'),'/opt/homebrew/bin','/usr/local/bin');
 const nvm=path.join(home,'.nvm','versions','node');try{for(const version of (await fs.readdir(nvm)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})))dirs.push(path.join(nvm,version,'bin'));}catch{}
 if(process.platform==='win32'){if(process.env.APPDATA)dirs.push(path.join(process.env.APPDATA,'npm'));if(process.env.LOCALAPPDATA)dirs.push(path.join(process.env.LOCALAPPDATA,'Programs','nodejs'));if(process.env.ProgramFiles)dirs.push(path.join(process.env.ProgramFiles,'nodejs'));}
 return [...new Set(dirs)];
}
function presetArgs(provider,root){return provider==='codex'?['exec','--skip-git-repo-check','--sandbox','read-only','--ephemeral','--color','never','{prompt}']:provider==='claude'?['-p','{prompt}','--output-format','text','--tools','Read','--allowedTools','Read','--add-dir',root]:['-p','{prompt}','--output-format','json','--include-directories',root];}
async function discoverAiCli(root,dirs){
 dirs=dirs??await directories();const result=[];
 for(const [provider,spec] of Object.entries(specs)){
  const args=presetArgs(provider,root);let found;
  for(const dir of dirs){
   const candidates=[path.join(dir,provider+(process.platform==='win32'?'.exe':''))];
   for(const base of [path.join(dir,'node_modules'),path.join(path.dirname(dir),'lib','node_modules')]){
    const folder=path.join(base,spec.package);try{const pkg=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8')),entry=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.[provider];if(entry)candidates.push(path.resolve(folder,entry));}catch{}
   }
   for(const candidate of candidates){
    if(!await exists(candidate))continue;const resolved=await fs.realpath(candidate);let isScript=/\.[cm]?js$/i.test(resolved);
    if(!isScript){const file=await fs.open(resolved,'r');try{const bytes=Buffer.alloc(160);await file.read(bytes,0,160,0);isScript=/^#!.*\bnode\b/.test(bytes.toString());}finally{await file.close();}}
    if(isScript){let node;for(const nodeDir of [dir,...dirs]){const file=path.join(nodeDir,process.platform==='win32'?'node.exe':'node');if(await exists(file)){node=file;break;}}if(!node)continue;found={executable:node,args:[resolved,...args]};}
    else{try{await fs.access(resolved,require('node:fs').constants.X_OK);}catch{continue;}found={executable:resolved,args};}
    break;
   }
   if(found)break;
  }
  result.push({provider,name:spec.name,found:!!found,executable:found?.executable??'',args:found?.args??args});
 }
 return result;
}
module.exports={discoverAiCli,presetArgs};

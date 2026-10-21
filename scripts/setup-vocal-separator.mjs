import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { basePython } from './lyrics-python.mjs';
import { run } from './native-downloads.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base=basePython(root),directory=path.join(root,'.build-tools',`vocal-separator-${process.platform}-${process.arch}`);
const python=path.join(directory,process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!await fs.stat(python).catch(()=>null))await run(base.command,[...base.args,'-m','venv',directory]);
await run(python,['-m','pip','install','--disable-pip-version-check','-r',path.join(root,'tools/vocal-separator/requirements.txt')]);
await run(python,['-m','pip','check']);
const models=path.join(root,'resources/vocal-separation/models');await fs.mkdir(models,{recursive:true});
const model=path.join(models,'955717e8-8726e21a.th');
const valid=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex').startsWith('8726e21a');
if(!await valid(model).catch(()=>false)){
 const response=await fetch('https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th');if(!response.ok)throw new Error(`Model download: ${response.status}`);
 const temp=model+'.partial';await fs.writeFile(temp,Buffer.from(await response.arrayBuffer()));if(!await valid(temp)){await fs.rm(temp,{force:true});throw new Error('Demucs 模型校驗失敗');}await fs.rename(temp,model);
}
const licenses=path.join(root,'resources/vocal-separation/licenses');await fs.mkdir(licenses,{recursive:true});
await run(python,['-c',`import importlib.metadata as m, pathlib, sys
out=pathlib.Path(sys.argv[1])
for dist in m.distributions():
 for file in dist.files or []:
  if 'license' in pathlib.Path(str(file)).name.lower() or 'copying' in pathlib.Path(str(file)).name.lower():
   source=pathlib.Path(dist.locate_file(file))
   if source.is_file():
    dest=out / dist.metadata['Name'] / pathlib.Path(str(file)).name
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(source.read_bytes())
`,licenses]);
console.log('本機人聲分離引擎與模型已準備完成');

import { requireEncoder } from '../shared/platform';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectSchema, endFrame, type Project, type ExportJob, type ExportSettings, type FontInfo } from '../shared/model';
import { atomicJson, Library } from './library';
import { renderSegment, segmentPlan } from './render';
import { ffmpeg, probe } from './native';

type JobRecord=ExportJob & {project:Project;fingerprints:Record<string,{size:number;mtimeMs:number}>};
export class Jobs {
  records:JobRecord[]=[];private running=false;private controller?:AbortController;private closing=false;
  constructor(public root:string,private library:Library,private fonts:FontInfo[],private fontRoot:string){}
  async init(){await fs.mkdir(this.root,{recursive:true});for(const entry of await fs.readdir(this.root,{withFileTypes:true})){if(!entry.isDirectory())continue;try{const j:JobRecord=JSON.parse(await fs.readFile(path.join(this.root,entry.name,'job.json'),'utf8'));if(j.status==='running'||j.status==='queued'){j.status='paused';j.error='上次工作已中斷，可繼續匯出。';}this.records.push(j);}catch{}}}
  list(){return this.records.map(({project:_,fingerprints:__,...j})=>j).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  get(id:string){const j=this.records.find(j=>j.id===id);if(!j)throw new Error('匯出工作不存在');return j;}
  dir(j:JobRecord){return path.join(this.root,j.id);}
  save(j:JobRecord){return atomicJson(path.join(this.dir(j),'job.json'),j);}
  async fingerprints(p:Project){const result:JobRecord['fingerprints']={};for(const id of new Set(p.clips.flatMap(c=>c.mediaId?[c.mediaId]:[]))){const m=this.library.get(id);const st=await fs.stat(m.path).catch(()=>null);if(!st)throw new Error(`找不到素材「${m.name}」，請先重新連結。`);result[id]={size:st.size,mtimeMs:st.mtimeMs};}return result;}
  async create(project:Project,settings:ExportSettings){
    requireEncoder(settings.encoder,process.platform);const p=ProjectSchema.parse(project);if(!p.clips.length)throw new Error('請先加入至少一個片段');const duration=endFrame(p)/p.fps;
    const space=await fs.statfs(this.root);const estimated=duration*((settings.resolution===2160?50:settings.resolution===1080?16:8)*1e6/8+192000)*2+256e6;
    if(space.bavail*space.bsize<estimated)throw new Error(`磁碟空間不足，預估需至少 ${(estimated/1e9).toFixed(1)} GB 可用空間。`);
    const j:JobRecord={id:randomUUID(),name:p.name,status:'queued',progress:0,completedSegments:0,totalSegments:segmentPlan(p).length,duration,createdAt:new Date().toISOString(),settings,project:p,fingerprints:await this.fingerprints(p)};
    await fs.mkdir(this.dir(j),{recursive:true});await this.save(j);this.records.push(j);void this.pump();return j;
  }
  async pause(id:string){const j=this.get(id);if(j.status==='running'){j.status='paused';this.controller?.abort();}else if(j.status==='queued')j.status='paused';await this.save(j);}
  async resume(id:string){const j=this.get(id);if(!['paused','failed'].includes(j.status))return;requireEncoder(j.settings.encoder,process.platform);if(this.running&&this.controller?.signal.aborted)throw new Error('正在停止上一個分段，請稍後再試');const current=await this.fingerprints(j.project);if(JSON.stringify(current)!==JSON.stringify(j.fingerprints))throw new Error('素材已變更，請建立新的匯出工作，以避免混用不同版本。');j.status='queued';j.error=undefined;await this.save(j);void this.pump();}
  private async pump(){if(this.running||this.closing)return;const j=this.records.find(j=>j.status==='queued');if(!j)return;this.running=true;this.controller=new AbortController();j.status='running';
    try{
      await this.save(j);if(JSON.stringify(await this.fingerprints(j.project))!==JSON.stringify(j.fingerprints))throw new Error('素材在排隊期間已變更，請建立新的匯出工作。');
      const plan=segmentPlan(j.project);const dir=this.dir(j);const list:string[]=[];
      for(let i=0;i<plan.length;i++){
        if(this.controller.signal.aborted)throw new Error('工作已暫停');const segment=plan[i];const name=`segment-${String(i).padStart(6,'0')}.mov`;const file=path.join(dir,name);
        // Only atomically completed segments are reused. Partial files are never trusted.
        const cached=await fs.stat(file).catch(()=>null);
        if(!cached||cached.size<100){const tmp=path.join(dir,`partial-${i}.mov`);await renderSegment(j.project,this.library,this.fonts,this.fontRoot,segment.from,segment.to,j.settings,tmp,path.join(dir,'assets'),{signal:this.controller.signal,onProgress:s=>{j.progress=Math.min(.97,(segment.from/j.project.fps+s)/j.duration*.97);}});await fs.rename(tmp,file);}
        list.push(`file '${name}'\nduration ${(segment.to-segment.from)/j.project.fps}`);j.completedSegments=i+1;j.progress=segment.to/endFrame(j.project)*.97;await this.save(j);
      }
      if(JSON.stringify(await this.fingerprints(j.project))!==JSON.stringify(j.fingerprints))throw new Error('素材在匯出期間已變更，請建立新的匯出工作。');
      const concat=path.join(dir,'concat.txt');await fs.writeFile(concat,list.join('\n')+'\n');const partial=path.join(dir,'output.partial.mp4');
      await ffmpeg(['-f','concat','-safe','1','-i',concat,'-map','0:v','-map','0:a','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(j.duration),'-movflags','+faststart','-progress','pipe:1','-nostats',partial],{signal:this.controller.signal,onProgress:s=>{j.progress=.97+Math.min(1,s/j.duration)*.03;}});
      const info=await probe(partial);if(Math.abs(Number(info.format.duration)-j.duration)>Math.max(.15,2/j.project.fps))throw new Error('成品長度驗證失敗，分段已保留，可重試。');
      await fs.rename(partial,path.join(dir,'output.mp4'));j.output=`/api/exports/${j.id}/file`;j.status='completed';j.progress=1;await this.save(j);
      // Successful output is self-contained; release intermediate disk space.
      for(const entry of await fs.readdir(dir)){if(entry.startsWith('segment-')||entry.startsWith('partial-')||entry==='assets'||entry==='concat.txt')await fs.rm(path.join(dir,entry),{recursive:true,force:true}).catch(()=>{});}
    }catch(e:any){if(this.controller.signal.aborted){j.status='paused';}else{j.status='failed';j.error=e.message;}await this.save(j);}finally{this.running=false;this.controller=undefined;void this.pump();}
  }
  close(){this.closing=true;this.controller?.abort();}
  get isRunning(){return this.running;}
}

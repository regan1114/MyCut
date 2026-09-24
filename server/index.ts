import { insertTimedClips } from '../shared/placement';
import express from 'express';
import busboy from 'busboy';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Library, atomicJson } from './library';
import { Jobs } from './jobs';
import { Projects } from './projects';
import { Preferences } from './preferences';
import { PortableProjects } from './portable';
import { SpeechJobs } from './speech';
import { audioFeatures } from './rhythm';
import { ProjectSchema, type FontInfo, newProject, makeClip, type Project } from '../shared/model';
import { ffmpeg, ffmpegPath } from './native';
import { unpackedPath, safeFileName, availableEncoders } from '../shared/platform';
export { safeFileName } from '../shared/platform';
import { Resvg } from '@resvg/resvg-js';

export async function startServer(options:{root?:string;port?:number;appRoot?:string}={}){
  const appRoot=options.appRoot??process.cwd();const root=options.root??path.join(appRoot,'.mycut');
  const fontRoot=unpackedPath(path.join(appRoot,'public/fonts'));const fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
  await fs.mkdir(path.join(root,'projects'),{recursive:true});const library=new Library(root);await library.init();const jobs=new Jobs(path.join(root,'exports'),library,fonts,fontRoot);await jobs.init();const projects=new Projects(root,library);const portable=new PortableProjects(library,projects);const speech=new SpeechJobs(path.join(root,'captions'),library,appRoot);await speech.init();
  const rhythmControllers=new Set<AbortController>();
  const preferences=new Preferences(root,fonts);await preferences.init();
  const app=express();app.disable('x-powered-by');let port=options.port??Number(process.env.PORT??4318);
  app.use((req,res,next)=>{
    const host=req.headers.host??'';if(!/^127\.0\.0\.1:\d+$/.test(host)&&!/^localhost:\d+$/.test(host))return res.status(403).json({error:'只接受本機連線'});
    const origin=req.headers.origin;const allowed=[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173'];
    if(origin&&!allowed.includes(origin)||req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'不允許此來源'});
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-mycut']!=='1')return res.status(403).json({error:'缺少本機應用請求標記'});
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");next();
  });
  app.use(express.json({limit:'16mb'}));
  const id=(s:string|string[])=>z.string().uuid().parse(s);
  const recordings=new Map<string,{file:string;seq:number;bytes:number}>();
  app.post('/api/recordings',async(_req,res)=>{const rid=randomUUID();const file=path.join(root,'media',`${rid}.webm`);await fs.writeFile(file,'');recordings.set(rid,{file,seq:0,bytes:0});res.json({id:rid});});
  app.post('/api/recordings/:id/finish',async(req,res)=>{const rid=id(req.params.id);const recording=recordings.get(rid);if(!recording)throw new Error('錄音工作不存在');const file=path.join(root,'media',`${rid}.m4a`);await ffmpeg(['-i',recording.file,'-vn','-c:a','aac','-b:a','192k','-ar','48000',file]);await library.import(file,true,`旁白 ${new Date().toLocaleString('zh-TW')}.m4a`);recordings.delete(rid);await fs.rm(recording.file,{force:true});res.json(library.list());});
  app.post('/api/recordings/:id/:seq',async(req,res)=>{const recording=recordings.get(id(req.params.id));if(!recording||Number(req.params.seq)!==recording.seq)throw new Error('錄音片段順序錯誤');let size=0;req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>32*1024*1024)req.destroy(new Error('錄音片段過大'));});await pipeline(req,createWriteStream(recording.file,{flags:'a'}));recording.seq++;recording.bytes+=size;res.json({ok:true});});
  app.get('/api/health',async(_req,res)=>{const st=await fs.statfs(root);res.json({ok:true,platform:process.platform,arch:process.arch,encoders:availableEncoders(process.platform),ffmpeg:!!await fs.stat(ffmpegPath).catch(()=>null),fonts:fonts.length,freeBytes:st.bavail*st.bsize,root});});
  app.get('/api/fonts',(_req,res)=>res.json(fonts));
  app.get('/api/preferences',(_req,res)=>res.json(preferences.get()));
  app.put('/api/preferences',async(req,res)=>res.json(await preferences.save(req.body)));
  app.get('/api/media/:id/rhythm',async(req,res)=>{const controller=new AbortController();rhythmControllers.add(controller);res.on('close',()=>controller.abort());try{res.json(await audioFeatures(library,id(req.params.id),controller.signal,req.query.spectrum==='1'));}finally{rhythmControllers.delete(controller);}});
  app.get('/api/media',(_req,res)=>res.json(library.list()));
  app.post('/api/media/:id/proxy',async(req,res)=>{await library.proxy(id(req.params.id));res.json({ok:true});});
  app.post('/api/media/upload',async(req,res)=>{
    const bb=busboy({headers:req.headers,defParamCharset:'utf8',limits:{files:32,fileSize:128*1024**3}});const imports:Promise<unknown>[]=[];
    bb.on('file',(_name,stream,info)=>{const file=path.join(root,'media',`${randomUUID()}${path.extname(info.filename).replace(/[^a-zA-Z0-9.]/g,'').slice(0,12)}`);let limited=false;stream.on('limit',()=>{limited=true;});const task=(async()=>{try{await pipeline(stream,createWriteStream(file));if(limited)throw new Error('單檔超過 128 GB');return await library.import(file,true,info.filename);}catch(e){await fs.rm(file,{force:true});throw e;}})();task.catch(()=>{});imports.push(task);});
    await new Promise<void>((resolve,reject)=>{bb.on('finish',resolve);bb.on('error',reject);req.on('aborted',()=>{bb.destroy(new Error('上傳已中斷'));reject(new Error('上傳已中斷'));});req.pipe(bb);});
    const result=await Promise.allSettled(imports);res.json({media:library.list(),imported:result.flatMap(r=>r.status==='fulfilled'?[(r.value as {id:string}).id]:[]),errors:result.flatMap(r=>r.status==='rejected'?[r.reason.message]:[])});
  });
  app.get('/media/:id/:variant',async(req,res)=>{const m=library.get(id(req.params.id));const variant=req.params.variant;const file=variant==='original'?m.path:variant==='thumbnail'?path.join(root,'cache',`${m.id}.jpg`):variant==='proxy'&&m.proxy?path.join(root,'cache',`${m.id}.proxy.mp4`):null;if(!file)return res.status(404).end();res.sendFile(file);});
  app.get('/api/portable',(_req,res)=>res.json(portable.status));
  app.post('/api/portable/cancel',(_req,res)=>{portable.cancel();res.json({ok:true});});
  app.get('/api/projects',async(req,res)=>res.json(await projects.list(req.query.trash==='1')));
  app.put('/api/projects/:id',async(req,res)=>{if(req.body.id!==id(req.params.id))throw new Error('專案 ID 不一致');const p=await projects.save(req.body);res.json({savedAt:p.updatedAt});});
  app.get('/api/projects/:id',async(req,res)=>res.json(await projects.read(id(req.params.id))));
  app.post('/api/projects/:id/rename',async(req,res)=>res.json(await projects.rename(id(req.params.id),z.string().trim().min(1).max(120).parse(req.body.name))));
  app.post('/api/projects/:id/duplicate',async(req,res)=>res.json(await projects.duplicate(id(req.params.id))));
  app.post('/api/projects/:id/trash',async(req,res)=>{await projects.move(id(req.params.id));res.json({ok:true});});
  app.post('/api/projects/:id/restore',async(req,res)=>{await projects.move(id(req.params.id),true);res.json({ok:true});});
  app.get('/api/speech',async(_req,res)=>res.json(await speech.capabilities()));
  app.get('/api/captions',async(req,res)=>res.json(speech.list(typeof req.query.projectId==='string'?id(req.query.projectId):undefined)));
  app.post('/api/captions',async(req,res)=>res.json(await speech.create(req.body.project,req.body.options)));
  app.get('/api/captions/:id',async(req,res)=>res.json(speech.get(id(req.params.id))));
  app.post('/api/captions/:id/pause',async(req,res)=>{await speech.pause(id(req.params.id));res.json({ok:true});});
  app.post('/api/captions/:id/resume',async(req,res)=>{await speech.resume(id(req.params.id));res.json({ok:true});});
  const Settings=z.object({resolution:z.union([z.literal(720),z.literal(1080),z.literal(2160)]),quality:z.enum(['standard','high']),encoder:z.enum(['libx264','h264_videotoolbox'])});
  app.get('/api/exports',(_req,res)=>res.json(jobs.list()));
  app.post('/api/exports',async(req,res)=>{const job=await jobs.create(req.body.project,Settings.parse(req.body.settings));res.json({id:job.id});});
  app.post('/api/exports/:id/pause',async(req,res)=>{await jobs.pause(id(req.params.id));res.json({ok:true});});
  app.post('/api/exports/:id/resume',async(req,res)=>{await jobs.resume(id(req.params.id));res.json({ok:true});});
  app.get('/api/exports/:id/file',async(req,res)=>{const j=jobs.get(id(req.params.id));if(j.status!=='completed')throw new Error('匯出尚未完成');res.download(path.join(jobs.dir(j),'output.mp4'),`${safeFileName(j.name)}.mp4`);});
  app.post('/api/demo',async(_req,res)=>{
    const demoPath=path.join(root,'media','mycut-landscape.png');
    if(!await fs.stat(demoPath).catch(()=>null)){
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#7f9aa2"/><stop offset=".63" stop-color="#d2c8ab"/><stop offset="1" stop-color="#e1b580"/></linearGradient><linearGradient id="m" x2="0" y2="1"><stop stop-color="#275358"/><stop offset="1" stop-color="#102d32"/></linearGradient><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".10"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><g filter="url(#g)"><path fill="url(#s)" d="M0 0H1920V1080H0z"/><circle cx="1400" cy="330" r="95" fill="#eee0b6"/><path fill="#6c8a88" d="M0 670 320 350 630 700 1070 300 1560 710 1920 430V1080H0z"/><path fill="#47716f" d="M0 810 290 560 540 820 810 630 1150 850 1530 550 1920 800V1080H0z"/><path fill="url(#m)" d="M0 850 450 730 820 960 1300 770 1690 930 1920 860V1080H0z"/><path fill="#e5cc98" opacity=".7" d="m1010 1080 77-145 86-60-45-68 66 64-77 82-54 127z"/></g></svg>`;await fs.writeFile(demoPath,new Resvg(svg).render().asPng());
    }
    const m=await library.import(demoPath,true,'山間・原創示範素材.png');const p=newProject();p.name='山間，慢一點';p.clips=[makeClip({kind:'image',mediaId:m.id,trackId:'main',start:0,duration:360,name:m.name,keyframes:[{frame:0,x:0,y:0,scale:1,opacity:1},{frame:360,x:-.025,y:.015,scale:1.12,opacity:1}]}),makeClip({kind:'text',trackId:'text',start:30,duration:270,name:'山間，慢一點',text:'山間，慢一點',fontId:'notoseriftc',fontSize:100,y:-.02,fadeIn:20,fadeOut:20}),makeClip({kind:'text',trackId:'text',start:50,duration:240,name:'A LITTLE CLOSER TO NATURE',text:'A LITTLE CLOSER TO NATURE',fontId:'montserrat',fontSize:26,y:.115,fadeIn:20,fadeOut:20})];res.json({project:insertTimedClips({...p,clips:[]},p.clips),media:library.list()});
  });
  app.use('/fonts',express.static(fontRoot));app.use(express.static(path.join(appRoot,'dist')));
  app.get('/{*splat}',(req,res)=>{if(req.path.startsWith('/api/')||req.path.startsWith('/media/'))return res.status(404).json({error:'找不到此資源'});res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.sendFile(path.join(appRoot,'dist/index.html'));});
  app.use((e:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(res.headersSent)return;res.status(e instanceof z.ZodError?400:500).json({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join('；'):e.message??'處理失敗'});});
  const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const s=app.listen(port,'127.0.0.1',(error?:Error)=>error?reject(error):resolve(s));s.once('error',reject);});port=(server.address() as {port:number}).port;
  return {server,port,library,jobs,projects,speech,portable,root,close:()=>{portable.cancel();for(const controller of rhythmControllers)controller.abort();library.close();jobs.close();speech.close();server.close();}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const service=await startServer();console.log(`MyCut running at http://127.0.0.1:${service.port}`);for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{service.close();process.exit(0);});
}

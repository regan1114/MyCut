import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {AiEditor} from '../server/ai-edit';
import {Library} from '../server/library';
import {ffmpeg} from '../server/native';
import {applyAiPlan,parsePlan,validatePlan} from '../shared/ai-edit';
import {newProject,makeClip,type Media} from '../shared/model';

test('AI plans stay inside video, preserve other tracks and speed/keyframes, and reject stale or locked edits',()=>{
 const p=newProject(),m:Media={id:randomUUID(),name:'video',kind:'video',duration:20,width:160,height:90,size:10,hasAudio:true};const c=makeClip({kind:'video',mediaId:m.id,trackId:'main',start:60,duration:120,sourceIn:2,speed:2,name:'original',keyframes:[{frame:0,x:0,y:0,scale:1,opacity:1},{frame:120,x:1,y:0,scale:1,opacity:1}]});const other=makeClip({kind:'text',trackId:'text',start:60,duration:120,text:'不變'});p.clips=[c,other];
 const plan=validatePlan({segments:[{start:3,end:5},{start:7,end:9}]},2,10);const next=applyAiPlan(p,m,plan,c),edited=next.clips.filter(c=>c.kind==='video');assert.deepEqual(next.clips.find(c=>c.id===other.id),other);assert.deepEqual(edited.map(c=>[c.start,c.duration,c.sourceIn,c.speed]),[[60,30,3,2],[90,30,7,2]]);assert.equal(edited[0].keyframes[0].x,.125);assert.equal(p.clips[0].id,c.id);
 assert.throws(()=>validatePlan({segments:[{start:1,end:3}]},2,10));assert.throws(()=>validatePlan({segments:[{start:2,end:5},{start:4,end:6}]},2,10));assert.throws(()=>applyAiPlan({...p,clips:[{...c,start:61},other]},m,plan,c));assert.throws(()=>applyAiPlan({...p,tracks:p.tracks.map(t=>({...t,locked:true}))},m,plan,c));assert.throws(()=>applyAiPlan(p,{...m,kind:'audio'},plan));
 const added=applyAiPlan(p,m,plan);assert.equal(added.clips.filter(c=>c.kind==='video').length,3);assert.deepEqual(added.clips.find(item=>item.id===c.id),c);assert.equal(parsePlan(JSON.stringify({response:'```json\n{"segments":[{"start":2,"end":3}]}\n```'}),2,10).segments.length,1);
});

test('AI API and CLI exchange real frames and validated plans; cancellation cleans temporary data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-ai-')),library=new Library(root);const ai=new AiEditor(library);let received:any;const server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);received=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'{"segments":[{"start":0,"end":1,"reason":"畫面"}]}'}}]}));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await library.init();const file=path.join(root,'video.mp4');await ffmpeg(['-f','lavfi','-i','color=c=blue:s=160x90:d=2','-c:v','libx264',file]);const m=await library.import(file);const config={mode:'api',endpoint:`http://127.0.0.1:${(server.address() as any).port}/v1/chat/completions`,model:'mock-vision',apiKey:'test-secret'};const input={id:randomUUID(),mediaId:m.id,from:0,to:2,instruction:'保留一秒',config};const plan=await ai.plan(input);assert.equal(plan.segments[0].end,1);assert.ok(received.messages[0].content.some((c:any)=>c.type==='image_url'&&c.image_url.url.startsWith('data:image/jpeg;base64,')));assert.equal(received.messages[0].content.some((c:any)=>c.text?.includes(file)),false);assert.deepEqual(await fs.readdir(path.join(root,'ai-temp')),[]);await ai.test(config);
 const cli=path.join(root,'cli.mjs');await fs.writeFile(cli,`let input=process.argv[2]??'';for await(const c of process.stdin)input+=c;if(!input.includes('本機抽樣圖片'))process.exit(2);console.log(JSON.stringify({response:JSON.stringify({segments:[{start:0,end:1,reason:'CLI'}]})}));`);const cliInput={...input,id:randomUUID(),config:{mode:'cli',executable:process.execPath,args:[cli]}};assert.equal((await ai.plan(cliInput,true)).segments[0].reason,'CLI');assert.equal((await ai.plan({...cliInput,id:randomUUID(),config:{...cliInput.config,args:[cli,'{prompt}']}},true)).segments[0].reason,'CLI');await assert.rejects(ai.plan({...cliInput,id:randomUUID()}),/桌面版/);
 await fs.writeFile(cli,`setInterval(()=>{},1000);`);const id=randomUUID(),pending=ai.plan({...cliInput,id},true);const rejected=assert.rejects(pending,/取消/);setTimeout(()=>ai.cancel(id),500);await rejected;assert.deepEqual(await fs.readdir(path.join(root,'ai-temp')),[]);
 await assert.rejects(ai.plan({...input,id:randomUUID(),from:1,to:30}));
 }finally{ai.close();library.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(root,{recursive:true,force:true});}
});

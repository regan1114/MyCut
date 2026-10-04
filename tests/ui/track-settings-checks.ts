import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, uid, type Project } from '../../shared/model';
import { chooseFont } from './font-helpers';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const url=(page:Page,pathname:string)=>new URL(pathname,page.url()).href;
async function open(page:Page,p:Project){
  expect((await page.request.put(url(page,`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url(page,'/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
}
async function saved(page:Page,p:Project):Promise<Project>{
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
  return (await page.request.get(url(page,`/api/projects/${p.id}`))).json();
}
async function color(page:Page,label:string,value:string){
  await page.getByLabel(label,{exact:true}).evaluate((input:HTMLInputElement,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  },value);
}

export async function checkTextTracks(page:Page){
  const p=newProject();p.name=`文字整軌檢查 ${uid().slice(0,6)}`;p.tracks.push({...p.tracks[0],id:'second-text',manualTextLane:true});
  p.clips=['甲','乙','丙'].map((text,i)=>makeClip({kind:'text',trackId:i===2?'second-text':'text',start:i===1?90:0,duration:60,text,fontSize:i===2?35:56,captionType:'captions',
    karaoke:{enabled:false,color:'#ffe27a',offset:i,source:'manual',words:[{text,start:i,end:50+i}]}}));
  p.markers=[{id:uid(),frame:180,name:'新增字幕位置'}];
  await open(page,p);await page.locator('.clip-text').filter({hasText:'乙'}).click();
  await chooseFont(page,'huninn');await page.getByLabel('字級',{exact:true}).press('End');await color(page,'文字顏色','#123456');
  await page.getByLabel('位置 X',{exact:true}).fill('192');await page.getByLabel('位置 Y',{exact:true}).fill('108');
  await page.getByLabel('縮放',{exact:true}).press('End');await page.getByLabel('旋轉',{exact:true}).press('Home');await page.getByLabel('不透明度',{exact:true}).press('ArrowLeft');
  await page.getByRole('button',{name:'水平翻轉',exact:true}).click();await page.getByRole('button',{name:'垂直翻轉',exact:true}).click();
  await page.getByLabel('畫面填滿',{exact:true}).selectOption('cover');await page.getByLabel('中心裁切',{exact:true}).press('End');
  await page.getByLabel('啟用卡拉 OK 高亮',{exact:true}).check();await color(page,'歌詞高亮顏色','#abcdef');
  const style={fontId:'huninn',fontSize:300,color:'#123456',x:.1,y:.1,scale:4,rotation:-180,opacity:.99,flipX:true,flipY:true,fit:'cover',crop:.45};
  let result=await saved(page,p);
  for(const c of result.clips.slice(0,2)){expect(c).toMatchObject(style);expect(c.karaoke).toMatchObject({enabled:true,color:'#abcdef'});}
  expect(result.clips[2]).toEqual(p.clips[2]);expect(result.clips.map(c=>c.karaoke.words)).toEqual(p.clips.map(c=>c.karaoke.words));
  await expect(page.getByLabel('文字背景底色')).toHaveCount(0);
  await page.getByRole('button',{name:/^復原（/}).click();expect((await saved(page,p)).clips.slice(0,2).map(c=>c.karaoke.color)).toEqual(['#ffe27a','#ffe27a']);
  await page.getByRole('button',{name:/^重做（/}).click();expect((await saved(page,p)).clips.slice(0,2).map(c=>c.karaoke.color)).toEqual(['#abcdef','#abcdef']);
  await page.getByLabel('文字內容',{exact:true}).fill('乙已修改');result=await saved(page,p);expect(result.clips[0].text).toBe('甲');expect(result.clips[1].text).toBe('乙已修改');expect(result.clips[0].karaoke.enabled).toBe(true);
  await page.getByRole('navigation').getByRole('button',{name:'字幕',exact:true}).click();await page.getByRole('button',{name:'字幕批次編輯',exact:true}).click();
  await page.getByLabel('批次處理範圍').selectOption('selected');await page.getByLabel('批次套用樣式').check();await page.getByLabel('批次字級').fill('44');
  await page.getByRole('button',{name:'預覽套用（1 則）',exact:true}).click();await expect(page.locator('.batch-footer')).toContainText('已變更 2 則');
  await page.getByRole('button',{name:'儲存批次變更',exact:true}).click();result=await saved(page,p);expect(result.clips.slice(0,2).map(c=>c.fontSize)).toEqual([44,44]);expect(result.clips[2]).toEqual(p.clips[2]);
  await page.getByRole('button',{name:'新增字幕位置（雙擊刪除）',exact:true}).click();await page.getByRole('button',{name:'新增字幕',exact:true}).click();
  result=await saved(page,p);expect(result.clips.at(-1)).toMatchObject({trackId:'text',start:180,fontSize:44,x:.1,y:.1});
  await expect(page.getByLabel('啟用卡拉 OK 高亮',{exact:true})).toBeChecked();await page.getByLabel('啟用卡拉 OK 高亮',{exact:true}).uncheck();
  result=await saved(page,p);expect(result.clips.filter(c=>c.trackId==='text').every(c=>!c.karaoke.enabled)).toBe(true);expect(result.clips[2]).toEqual(p.clips[2]);
  await page.getByLabel('啟用卡拉 OK 高亮',{exact:true}).check();
  await page.getByRole('button',{name:'新增軌道',exact:true}).click();result=await saved(page,p);expect(result.tracks.filter(t=>t.kind==='text')).toHaveLength(3);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const reloaded=await saved(page,p);expect(reloaded.clips).toEqual(result.clips);expect(reloaded.tracks).toEqual(result.tracks);
  await page.screenshot({path:'test-results/track-settings-text.png',fullPage:true});
}

export async function checkMediaTracks(page:Page){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-track-media-'));
  try{
    const file=path.join(root,'video.mp4'),audio=path.join(root,'audio.wav'),ffmpeg=createRequire(import.meta.url)('ffmpeg-static');
    await promisify(execFile)(ffmpeg,['-hide_banner','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-preset','ultrafast','-c:a','aac',file]);
    await promisify(execFile)(ffmpeg,['-hide_banner','-y','-f','lavfi','-i','sine=frequency=220:duration=6',audio]);
    const upload=async(file:string,mimeType:string)=>{const response=await page.request.post(url(page,'/api/media/upload'),{headers:{'X-MyCut':'1'},multipart:{file:{name:path.basename(file),mimeType,buffer:await fs.readFile(file)}}});expect(response.ok()).toBeTruthy();return (await response.json()).imported[0] as string;};
    const videoId=await upload(file,'video/mp4'),audioId=await upload(audio,'audio/wav');
    const demo=await(await page.request.post(url(page,'/api/demo'),{headers:{'X-MyCut':'1'}})).json(),imageId=demo.project.clips.find((c:any)=>c.kind==='image').mediaId;
    const p=newProject();p.name=`媒體軌道檢查 ${uid().slice(0,6)}`;p.mediaIds=[videoId,audioId,imageId];
    p.clips=[makeClip({kind:'video',mediaId:videoId,trackId:'main',start:0,duration:60,name:'影片'}),makeClip({kind:'image',mediaId:imageId,trackId:'main',start:90,duration:60,name:'圖片'}),makeClip({kind:'audio',mediaId:audioId,trackId:'music',start:0,duration:60,name:'聲音一'}),makeClip({kind:'audio',mediaId:audioId,trackId:'music',start:90,duration:60,name:'聲音二'})];
    await open(page,p);await page.getByRole('button',{name:'磁吸對齊',exact:true}).click();
    for(const [index,name,kind] of [[1,'圖片','video'],[3,'聲音二','audio']] as const){
      const clip=page.locator('.timeline-clip').filter({hasText:name});
      const drag=async(dx:number)=>{const b=(await clip.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2,{steps:8});await page.mouse.up();};
      await drag(-110);let result=await saved(page,p);expect(result.clips[index].start).toBe(30);expect(result.clips[index].trackId).not.toBe(p.clips[index].trackId);expect(result.tracks.find(t=>t.id===result.clips[index].trackId)!.kind).toBe(kind);
      await drag(110);result=await saved(page,p);expect(result.clips[index].start).toBe(90);expect(result.clips[index].trackId).toBe(p.clips[index].trackId);expect(result.tracks).toHaveLength(3);
    }
    await page.locator('.clip-video').click();await page.getByLabel('片段長度',{exact:true}).fill('4');let result=await saved(page,p);expect(result.clips[0].duration).toBe(120);expect(result.clips[0].trackId).not.toBe('main');
    await page.getByLabel('片段長度',{exact:true}).fill('2');result=await saved(page,p);expect(result.clips[0].trackId).toBe('main');expect(result.tracks).toHaveLength(3);
    await page.getByLabel('速度',{exact:true}).press('Home');result=await saved(page,p);expect(result.clips[0].speed).toBe(.25);expect(result.clips[0].duration).toBe(240);expect(result.clips[0].trackId).not.toBe('main');
    const lane=page.locator('[data-track="main"]'),bounds=(await lane.boundingBox())!,dt=await page.evaluateHandle(id=>{const data=new DataTransfer();data.setData('mycut/media',id);return data;},imageId);
    await lane.dispatchEvent('drop',{dataTransfer:dt,clientX:bounds.x+55,clientY:bounds.y+bounds.height/2});await dt.dispose();
    result=await saved(page,p);expect(result.clips).toHaveLength(5);expect(result.clips.at(-1)!.start).toBe(30);expect(result.clips.at(-1)!.kind).toBe('image');expect(result.tracks.find(t=>t.id===result.clips.at(-1)!.trackId)!.kind).toBe('video');
    for(const c of result.clips)for(const other of result.clips)if(c.id!==other.id&&c.trackId===other.trackId)expect(c.start>=other.start+other.duration||other.start>=c.start+c.duration).toBe(true);
    await page.screenshot({path:'test-results/track-settings-media.png',fullPage:true});
    await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();expect((await saved(page,p)).clips).toEqual(result.clips);
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

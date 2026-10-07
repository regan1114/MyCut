import { expect, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { makeClip, newProject, type Project } from '../../shared/model';

export async function checkImageAudioSnapping(page:Page,track:'main'|'logo',scrolled=false){
  const url=(pathname:string)=>new URL(pathname,page.url()).href,headers={'X-MyCut':'1'},p=newProject(),musicEnd=6695;
  p.name=`圖片對齊音樂 ${track} ${scrolled?'捲動尾端':'完整時間軸'}`;
  const png=createCanvas(160,90),ctx=png.getContext('2d');ctx.fillStyle='#4c7ba5';ctx.fillRect(0,0,160,90);
  const dataLength=Math.floor(musicEnd/p.fps*8000)*2,wav=Buffer.alloc(44+dataLength);
  wav.write('RIFF');wav.writeUInt32LE(36+dataLength,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(dataLength,40);
  const mediaIds:string[]=[];
  for(const [name,mimeType,buffer] of [['磁吸圖片.png','image/png',await png.encode('png')],['三分多鐘音樂.wav','audio/wav',wav]] as const){
    const response=await page.request.post(url('/api/media/upload'),{headers,multipart:{file:{name,mimeType,buffer}}});expect(response.ok()).toBeTruthy();
    const uploaded=await response.json();expect(uploaded.errors).toEqual([]);mediaIds.push(uploaded.imported[0]);
  }
  p.tracks.splice(1,0,{...p.tracks[1],id:'logo',name:'上層圖片'});p.mediaIds=mediaIds;
  const photo=makeClip({kind:'image',mediaId:mediaIds[0],trackId:track,start:0,duration:scrolled?musicEnd-300:150,name:'拉長這張圖片'});
  const other=makeClip({kind:'image',mediaId:mediaIds[0],trackId:track==='main'?'logo':'main',start:0,duration:150,name:'另一張圖片'});
  const music=makeClip({kind:'audio',mediaId:mediaIds[1],trackId:'music',start:0,duration:musicEnd,name:'音樂對齊參考'});p.clips=[photo,other,music];
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers,data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await expect(page.getByRole('button',{name:'磁吸對齊',exact:true})).toHaveAttribute('aria-pressed','true');
  const scroll=page.locator('.timeline-scroll');
  if(scrolled)await scroll.evaluate((el,end)=>el.scrollLeft=end*55/30-el.clientWidth*.8,musicEnd);
  else await page.getByRole('button',{name:'符合整段影片',exact:true}).click();
  const zoom=await page.locator('.timeline-content').evaluate((el,seconds)=>parseFloat((el as HTMLElement).style.width)/seconds,musicEnd/p.fps+10),pxFrame=zoom/p.fps;
  const handle=page.getByRole('button',{name:'拉長這張圖片，00:00:00:00',exact:true}).locator('.trim-handle.right'),guide=page.locator('.timeline-snap-guide');
  const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,targetX=x+(musicEnd-photo.duration)*pxFrame;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(targetX+4,y,{steps:12});
  await expect(guide).toHaveCount(1);expect(await guide.evaluate(el=>parseFloat((el as HTMLElement).style.left))).toBeCloseTo(musicEnd*pxFrame,1);
  await page.mouse.move(targetX+18,y);await expect(guide).toHaveCount(0);
  await page.mouse.move(targetX+4,y);await expect(guide).toHaveCount(1);
  await page.screenshot({path:`test-results/image-audio-snap-${track}-${scrolled?'scrolled':'fit'}.png`,fullPage:true});await page.mouse.up();
  const read=async()=>{await expect(page.locator('.save-state')).toHaveText('已儲存至本機');return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  const saved=await read();expect(saved.clips.find(c=>c.id===photo.id)).toMatchObject({start:0,duration:musicEnd});
  expect(saved.clips.find(c=>c.id===music.id)).toEqual(music);expect(saved.clips.find(c=>c.id===other.id)).toEqual(other);
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:/^重做/}).click();expect((await read()).clips).toEqual(saved.clips);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();
  await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();expect((await read()).clips).toEqual(saved.clips);
}

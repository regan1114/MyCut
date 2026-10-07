import { test, expect } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeClip, type ExportJob, type Project } from '../../shared/model';
import { ffmpeg } from '../../server/native';
import { projectWithOverlay } from '../fixtures/project';

let root:string;
const mediaIds=new Map<string,string>();
test.beforeAll(async({request})=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-layering-'));
  for(const color of ['red','blue'])for(const kind of ['image','video']){
    const name=`${color}.${kind==='image'?'png':'mp4'}`,file=path.join(root,name);
    if(kind==='image'){
      const canvas=createCanvas(320,180),ctx=canvas.getContext('2d');ctx.fillStyle=color;
      if(color==='red')ctx.fillRect(40,30,240,120);else ctx.fillRect(0,0,320,180);
      await fs.writeFile(file,await canvas.encode('png'));
    }else await ffmpeg(['-f','lavfi','-i',`color=c=${color}:s=320x180:r=30:d=2`,'-c:v','libx264','-pix_fmt','yuv420p',file]);
    const response=await request.post('/api/media/upload',{headers:{'X-MyCut':'1'},multipart:{file:{name,mimeType:kind==='image'?'image/png':'video/mp4',buffer:await fs.readFile(file)}}});
    expect(response.ok()).toBeTruthy();const uploaded=await response.json();expect(uploaded.errors).toEqual([]);
    mediaIds.set(`${color}-${kind}`,uploaded.imported[0]);
  }
});
test.afterAll(async()=>{if(root)await fs.rm(root,{recursive:true,force:true});});

const colorOf=(rgb:number[])=>rgb[0]>220&&rgb[1]<25&&rgb[2]<25?'red':rgb[2]>220&&rgb[0]<25&&rgb[1]<25?'blue':rgb.join(',');
for(const upperKind of ['image','video'] as const)for(const lowerKind of ['image','video'] as const){
  test(`${upperKind} above ${lowerKind} stays in front in preview, selection and export`,async({page})=>{
    const p=projectWithOverlay();p.name=`軌道層級 ${upperKind} / ${lowerKind}`;
    const upper=makeClip({kind:upperKind,trackId:'overlay',mediaId:mediaIds.get(`red-${upperKind}`),start:0,duration:60,name:'上層紅色',scale:.5});
    const lower=makeClip({kind:lowerKind,trackId:'main',mediaId:mediaIds.get(`blue-${lowerKind}`),start:0,duration:60,name:'下層藍色'});
    // Deliberately store the upper clip first: clip insertion order must not determine stacking.
    p.clips=[upper,lower];
    expect((await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
    await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
    const canvas=page.getByLabel('影片預覽，可拖曳影片或圖片調整位置');
    const pixels=()=>canvas.evaluate((el:HTMLCanvasElement)=>[.5,.1].map(x=>Array.from(el.getContext('2d')!.getImageData(el.width*x,el.height/2,1,1).data).slice(0,3)));
    const colors=async()=>(await pixels()).map(colorOf);
    await expect.poll(colors).toEqual(['red','blue']);
    const upperLane=page.locator('[data-track="overlay"]'),lowerLane=page.locator('[data-track="main"]');
    expect((await upperLane.boundingBox())!.y).toBeLessThan((await lowerLane.boundingBox())!.y);
    await lowerLane.locator('.timeline-clip').press('Enter');await expect(lowerLane.locator('.timeline-clip')).toHaveClass(/selected/);
    await expect.poll(colors).toEqual(['red','blue']);
    await canvas.click();await expect(upperLane.locator('.timeline-clip')).toHaveClass(/selected/);
    const upperHeader=page.locator('.track-header').filter({hasText:'疊加畫面'});
    await upperHeader.getByRole('button',{name:'隱藏軌道',exact:true}).click();await expect.poll(colors).toEqual(['blue','blue']);
    await canvas.click();await expect(lowerLane.locator('.timeline-clip')).toHaveClass(/selected/);
    await upperHeader.getByRole('button',{name:'顯示軌道',exact:true}).click();await expect.poll(colors).toEqual(['red','blue']);
    await page.getByRole('button',{name:'播放（Space）',exact:true}).click();
    await expect(page.locator('.time-display b')).not.toHaveText('00:00:00:00');
    await page.getByRole('button',{name:'暫停（Space）',exact:true}).click();await expect.poll(colors).toEqual(['red','blue']);
    await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
    const saved=await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;
    expect(saved.clips).toEqual(p.clips);
    const response=await page.request.post('/api/exports',{headers:{'X-MyCut':'1'},data:{project:saved,settings:{resolution:720,quality:'standard',encoder:'libx264'}}});
    expect(response.ok()).toBeTruthy();const {id}=await response.json();
    let job:ExportJob|undefined;
    await expect.poll(async()=>{job=(await(await page.request.get('/api/exports')).json() as ExportJob[]).find(j=>j.id===id);return job?.status;},{timeout:45000,intervals:[250,500]}).toMatch(/completed|failed/);
    expect(job!.status,job!.error).toBe('completed');
    const output=await page.request.get(job!.output!);expect(output.ok()).toBeTruthy();
    const movie=path.join(root,`${p.id}.mp4`),still=path.join(root,`${p.id}.png`);
    await fs.writeFile(movie,await output.body());await ffmpeg(['-ss','0.5','-i',movie,'-frames:v','1',still]);
    const image=await loadImage(still),frame=createCanvas(image.width,image.height),ctx=frame.getContext('2d');ctx.drawImage(image,0,0);
    expect([.5,.1].map(x=>colorOf(Array.from(ctx.getImageData(frame.width*x,frame.height/2,1,1).data).slice(0,3)))).toEqual(['red','blue']);
  });
}

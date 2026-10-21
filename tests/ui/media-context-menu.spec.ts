import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { createCanvas } from '@napi-rs/canvas';
import { makeClip, newProject } from '../../shared/model';

test('media context actions follow the clicked type and detach the clicked video',async({page})=>{
 test.setTimeout(180000);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-menu-'));
 try{
  const file=path.join(root,'video.mp4');
  execFileSync(ffmpeg!,['-y','-f','lavfi','-i','color=c=blue:s=160x90:d=2','-i','tests/fixtures/original-en.wav','-t','2','-c:v','libx264','-c:a','aac',file],{stdio:'ignore'});
  const headers={'X-Reelume':'1'};
  const uploaded=await(await page.request.post('/api/media/upload',{headers,multipart:{file:{name:'影片.mp4',mimeType:'video/mp4',buffer:await fs.readFile(file)}}})).json();
  const ids:string[]=[];
  for(const [name,mimeType,buffer] of [['歌曲.wav','audio/wav',await fs.readFile('tests/fixtures/original-en.wav')],['圖片.png','image/png',createCanvas(160,90).toBuffer('image/png')]] as const){const result=await(await page.request.post('/api/media/upload',{headers,multipart:{file:{name,mimeType,buffer}}})).json();ids.push(result.imported[0]);}
  const id=uploaded.imported[0],p=newProject();p.name='右鍵測試';p.mediaIds=[id,...ids];p.clips=[makeClip({kind:'video',mediaId:id,trackId:'main',start:0,duration:60,name:'目標影片'}),makeClip({kind:'text',trackId:'text',start:0,duration:60,text:'其他選取'})];
  await page.request.put(`/api/projects/${p.id}`,{headers,data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await expect(page.getByRole('button',{name:'分離音訊',exact:true})).toHaveCount(0);
  await page.locator('.clip-text').click();await page.locator('.clip-video').click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'分離音訊',exact:true})).toBeEnabled();await expect(page.getByRole('menuitem',{name:'分離人聲'})).toBeEnabled();
  await page.getByRole('menuitem',{name:'分離音訊',exact:true}).click();await expect(page.locator('.clip-audio')).toHaveCount(1);
  await page.locator('.clip-audio').click({button:'right'});await expect(page.getByRole('menuitem',{name:'分離音訊',exact:true})).toHaveCount(0);await expect(page.getByRole('menuitem',{name:/分離人聲/})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('.clip-text').click({button:'right'});await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('.media-card').filter({hasText:'歌曲.wav'}).click({button:'right'});await expect(page.getByRole('menuitem',{name:'分離音訊',exact:true})).toHaveCount(0);await expect(page.getByRole('menuitem',{name:/分離人聲/})).toBeVisible();
  await page.locator('.media-card').filter({hasText:'圖片.png'}).click({button:'right'});await expect(page.getByRole('menu')).toHaveCount(0);
  await page.locator('.media-card').filter({hasText:'影片.mp4'}).click({button:'right'});await expect(page.getByRole('menuitem',{name:'分離音訊',exact:true})).toBeEnabled();await page.getByRole('menuitem',{name:'分離音訊',exact:true}).click();await expect(page.locator('.clip-audio')).toHaveCount(2);
  await page.getByRole('button',{name:/^復原/}).click();await expect(page.locator('.clip-audio')).toHaveCount(1);
  await page.locator('.media-card').filter({hasText:'影片.mp4'}).click({button:'right'});await page.getByRole('menuitem',{name:'分離人聲',exact:true}).click();
  await expect(page.getByLabel('人聲分離進度')).toBeVisible();
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:'建立新專案',exact:true}).click();
  await expect(page.getByText('人聲 WAV 已加入原專案素材庫',{exact:true})).toBeVisible({timeout:150000});await expect(page.locator('.media-card')).toHaveCount(0);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await expect(page.locator('.media-card').filter({hasText:'影片 · 人聲.wav'})).toBeVisible();
  await expect(page.locator('.clip-audio')).toHaveCount(1);
  await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(page.locator('.media-card').filter({hasText:'影片 · 人聲.wav'})).toBeVisible();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

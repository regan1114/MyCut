import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

export async function checkInspectorNumbers(page:Page){
  const url=(pathname:string)=>new URL(pathname,page.url()).href,p=newProject();p.name='文字數值輸入';
  p.tracks.push({...p.tracks[0],id:'other-text',manualTextLane:true});
  p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'輸入數值',scale:1.23456,keyframes:[{frame:0,x:0,y:0,scale:1.23456,opacity:1},{frame:90,x:0,y:0,scale:2,opacity:1}]}),makeClip({kind:'text',trackId:'text',start:120,duration:90,text:'同軌文字'}),makeClip({kind:'text',trackId:'other-text',start:0,duration:90,text:'另一軌文字'})];
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const select=()=>page.getByRole('button',{name:'輸入數值，00:00:00:00',exact:true}).click();await select();
  const scale=page.getByRole('spinbutton',{name:'縮放數值',exact:true}),opacity=page.getByRole('spinbutton',{name:'不透明度數值',exact:true}),crop=page.getByRole('spinbutton',{name:'中心裁切數值',exact:true});
  const read=async()=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  await scale.focus();await scale.press('Tab');expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:'播放（Space）',exact:true}).click();await scale.fill('125');
  const time=page.locator('.time-display b'),typingAt=await time.innerText();await expect(time).not.toHaveText(typingAt);await expect(scale).toHaveValue('125');
  await scale.press('Enter');await page.getByRole('button',{name:'暫停（Space）',exact:true}).click();await opacity.fill('68');await opacity.press('Tab');await crop.fill('0.12');await crop.press('Enter');
  const saved=await read();for(const c of saved.clips.slice(0,2))expect(c).toMatchObject({scale:1.25,opacity:.68,crop:.12});expect(saved.clips[2]).toEqual(p.clips[2]);
  for(const [label,value] of [['縮放','125'],['不透明度','68'],['中心裁切','0.12']])await expect(page.getByRole('slider',{name:label,exact:true})).toHaveValue(value);
  await scale.fill('');await scale.press('Tab');await expect(scale).toHaveValue('125');expect((await read()).clips).toEqual(saved.clips);
  await opacity.fill('23');await opacity.press('Escape');await opacity.press('Tab');await expect(opacity).toHaveValue('68');expect((await read()).clips).toEqual(saved.clips);
  for(const [input,value,key,bound] of [[scale,'500','scale',4],[opacity,'-20','opacity',0],[crop,'9','crop',.45]] as const){
    await input.fill(value);await input.press('Enter');expect((await read()).clips[0][key]).toBe(bound);
    await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual(saved.clips);
    await page.getByRole('button',{name:/^重做/}).click();expect((await read()).clips[0][key]).toBe(bound);
    await page.getByRole('button',{name:/^復原/}).click();await read();
  }
  await page.getByRole('slider',{name:'縮放',exact:true}).press('ArrowRight');await expect(scale).toHaveValue('126');expect((await read()).clips[0].scale).toBe(1.26);
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual(saved.clips);
  // An unfinished edit must never be applied to the next selected clip.
  await scale.fill('250');await page.getByRole('button',{name:'另一軌文字，00:00:00:00',exact:true}).click();await expect(scale).toHaveValue('100');expect((await read()).clips[2]).toEqual(p.clips[2]);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await select();
  const reopened=await read();expect(reopened.clips[0]).toMatchObject({scale:1.25,opacity:.68,crop:.12});expect(reopened.clips[2]).toEqual(p.clips[2]);
  await expect(scale).toHaveValue('125');await expect(opacity).toHaveValue('68');await expect(crop).toHaveValue('0.12');
  await crop.scrollIntoViewIfNeeded();await page.mouse.move(800,80);await page.screenshot({path:'test-results/inspector-numeric-inputs.png',fullPage:true});
}

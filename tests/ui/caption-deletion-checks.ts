import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, uid, type Project } from '../../shared/model';

export async function checkCaptionDeletion(page:Page){
  const url=(pathname:string)=>new URL(pathname,page.url()).href,p=newProject(),groupId=uid();p.name='字幕刪除驗證';
  p.tracks.push({...p.tracks[0],id:'locked-captions',name:'鎖定字幕軌',locked:true,manualTextLane:true});
  p.clips=[
    makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'第一句字幕',captionType:'captions'}),
    makeClip({kind:'text',trackId:'text',start:90,duration:90,text:'第二句字幕',captionType:'captions',groupId}),
    makeClip({kind:'text',trackId:'text',start:180,duration:90,text:'第三句歌詞',captionType:'lyrics'}),
    makeClip({kind:'text',trackId:'locked-captions',start:270,duration:90,text:'鎖定保留字幕',captionType:'captions'}),
    makeClip({kind:'shape',trackId:'main',start:0,duration:360,name:'群組底圖',groupId})
  ];
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await page.getByRole('button',{name:'第一句字幕，00:00:00:00',exact:true}).click();await page.getByRole('button',{name:'字幕屬性',exact:true}).click();
  const list=page.getByRole('list',{name:'專案字幕清單'}),search=page.getByLabel('搜尋字幕內容');
  const row=(text:string)=>list.getByRole('listitem').filter({hasText:text});
  const remove=(text:string)=>row(text).getByRole('button',{name:/^刪除字幕 /}).click();
  const read=async()=>{await expect(page.locator('.save-state')).toHaveText('已儲存至本機');return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  await expect(row('鎖定保留字幕').getByRole('button',{name:/^刪除字幕 /})).toBeDisabled();
  // A row action targets that exact caption, even when another caption is selected
  // and the removed caption is grouped with a visual clip.
  await search.fill('第二句');await remove('第二句字幕');
  await expect(list.getByRole('listitem')).toHaveCount(0);await expect(page.locator('.clip-text.selected')).toContainText('第一句字幕');
  expect((await read()).clips).toEqual(p.clips.filter(c=>c.id!==p.clips[1].id));
  await list.focus();await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:/^重做/}).click();expect((await read()).clips).toEqual(p.clips.filter(c=>c.id!==p.clips[1].id));
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:'清除字幕搜尋'}).click();
  // Deleting the selected caption keeps the list open on the next unlocked row.
  await remove('第一句字幕');await expect(list.getByRole('button',{pressed:true})).toContainText('第二句字幕');
  expect((await read()).clips).toEqual(p.clips.slice(1));
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();
  await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await page.getByRole('button',{name:'第二句字幕，00:00:03:00',exact:true}).click();await page.getByRole('button',{name:'字幕屬性',exact:true}).click();
  await expect(row('第一句字幕')).toHaveCount(0);expect((await read()).clips).toEqual(p.clips.slice(1));
  await page.setViewportSize({width:1020,height:740});
  const inside=await list.evaluate(el=>{const outer=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(button=>{const box=button.getBoundingClientRect();return box.left>=outer.left&&box.right<=outer.right;});});expect(inside).toBe(true);
  await page.mouse.move(500,60);await page.screenshot({path:'test-results/caption-delete-buttons.png',fullPage:true});
  await row('第三句歌詞').locator('.caption-list-select').click();await remove('第三句歌詞');
  await expect(list.getByRole('button',{pressed:true})).toContainText('第二句字幕');await remove('第二句字幕');
  expect((await read()).clips).toEqual(p.clips.slice(3));await expect(page.locator('.panel-header').filter({hasText:'專案設定'})).toBeVisible();
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual([p.clips[1],...p.clips.slice(3)]);
}

import { test, expect } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

test('adjusted settings are recorded, survive reopening and apply to another clip with undo',async({page})=>{
  const p=newProject();p.name='片段設定重用';p.tracks.push({...p.tracks[0],id:'other-text',manualTextLane:true});
  p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:90,name:'設定來源',text:'設定來源'}),makeClip({kind:'text',trackId:'other-text',start:0,duration:90,name:'套用目標',text:'套用目標'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-Reelume':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await page.getByRole('button',{name:'設定來源，00:00:00:00',exact:true}).click();const scale=page.getByRole('spinbutton',{name:'縮放數值',exact:true});await scale.fill('150');await scale.press('Enter');const outline=page.getByRole('slider',{name:'黑色描邊',exact:true});await outline.press('Home');for(let i=0;i<8;i++)await outline.press('ArrowRight');
  await expect.poll(async()=>{const presets=await(await page.request.get('/api/clip-presets')).json();return presets.find((preset:{clipId:string})=>preset.clipId===p.clips[0].id)?.settings.scale;}).toBe(1.5);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await page.getByRole('button',{name:'套用目標，00:00:00:00',exact:true}).click();
  await page.locator('summary').filter({hasText:'最近設定'}).click();const picker=page.getByRole('combobox',{name:'已記錄片段設定'});await expect(picker.locator('option').filter({hasText:'設定來源'})).toHaveCount(1);await picker.selectOption({label:await picker.locator('option').filter({hasText:'設定來源'}).innerText()});await page.getByRole('button',{name:'套用片段設定',exact:true}).click();await expect(scale).toHaveValue('150');await expect(page.getByRole('slider',{name:'黑色描邊',exact:true})).toHaveValue('4');
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();const saved=await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;expect(saved.clips[1]).toMatchObject({scale:1.5,textOutline:4,text:'套用目標',start:0,duration:90,trackId:'other-text'});
  await page.getByRole('button',{name:/^復原/}).click();await expect(scale).toHaveValue('100');await expect(page.getByRole('slider',{name:'黑色描邊',exact:true})).toHaveValue('0');await page.screenshot({path:'test-results/clip-presets.png',fullPage:true});
});

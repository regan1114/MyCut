import { test,expect } from '@playwright/test';

test('new text defaults to 70 and typed font size saves, updates its slider and enters recent settings',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'建立新專案',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();
  const size=page.getByRole('spinbutton',{name:'字級數值',exact:true}),slider=page.getByRole('slider',{name:'字級',exact:true});await expect(size).toHaveValue('70');await size.fill('85');await size.press('Enter');await expect(slider).toHaveValue('85');
  await expect.poll(async()=>{const presets=await(await page.request.get('/api/clip-presets')).json();return presets[0]?.settings.fontSize;}).toBe(85);
  await size.fill('120');await size.press('Escape');await size.press('Tab');await expect(size).toHaveValue('85');
  await size.fill('95');await size.press('Tab');await expect(slider).toHaveValue('95');await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
  const projectName=await page.locator('.project-switch span').innerText();await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${projectName}`,exact:true}).click();await page.locator('.timeline-clip').click();await expect(size).toHaveValue('95');
});

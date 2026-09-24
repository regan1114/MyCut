import { test, expect } from '@playwright/test';

test('compact interface labels icons on hover and keyboard focus, including disabled controls',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{name:'我的專案',exact:true})).toBeVisible();await expect(page.locator('.loading-screen')).toHaveCount(0);
  expect((await page.locator('.home-hero').boundingBox())!.height).toBeLessThan(200);await expect(page.locator('.home-art')).toHaveCount(0);
  await page.screenshot({path:'test-results/simple-home.png',fullPage:true});
  await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();const nav=page.getByRole('navigation');
  await expect(nav.getByRole('button')).toHaveCount(8);
  for(const button of await nav.getByRole('button').all())expect((await button.innerText()).trim()).toBe('');
  const tooltip=page.getByRole('tooltip');
  await nav.getByRole('button',{name:'文字',exact:true}).hover();await expect(tooltip).toHaveText('文字');await expect(nav.getByRole('button',{name:'文字',exact:true})).toHaveAttribute('aria-describedby','mycut-tooltip');
  await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
  const split=page.getByRole('button',{name:/^分割（/});await expect(split).toBeDisabled();await split.hover();await expect(tooltip).toContainText('分割');
  await page.mouse.move(900,80);await expect(tooltip).toHaveCount(0);
  await nav.getByRole('button',{name:'素材',exact:true}).focus();await page.keyboard.press('Tab');await expect(nav.getByRole('button',{name:'音訊',exact:true})).toBeFocused();await expect(tooltip).toHaveText('音訊');
  await page.keyboard.press('Enter');await expect(tooltip).toHaveCount(0);await expect(nav.getByRole('button',{name:'音訊',exact:true})).toHaveAttribute('aria-pressed','true');
  await nav.getByRole('button',{name:'特效',exact:true}).click();await expect(page.locator('.fx-card')).toHaveCount(40);await expect(page.locator('.library-panel').getByLabel('特效品質',{exact:true})).toHaveCount(0);
  await expect(page.locator('.inspector').getByLabel('特效品質',{exact:true})).toBeVisible();await expect(page.locator('.inspector .fx-card')).toHaveCount(0);
  await page.getByRole('button',{name:'櫻花',exact:true}).hover();await expect(tooltip).toContainText('櫻花');await page.locator('.library-scroll').evaluate(el=>el.scrollTop=200);await expect(tooltip).toHaveCount(0);
  await nav.getByRole('button',{name:'素材',exact:true}).click();await page.mouse.move(900,80);await nav.getByRole('button',{name:'素材',exact:true}).hover();await expect(tooltip).toHaveText('素材');
  await page.screenshot({path:'test-results/simple-editor-tooltip.png',fullPage:true});
  await page.setViewportSize({width:1120,height:740});await page.getByRole('button',{name:'放大時間軸',exact:true}).hover();await expect(tooltip).toHaveText('放大時間軸');const box=(await tooltip.boundingBox())!;expect(box.height).toBeLessThan(40);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(1120);expect(box.y+box.height).toBeLessThanOrEqual(740);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);await page.screenshot({path:'test-results/simple-small-tooltip.png',fullPage:true});
  await page.getByRole('button',{name:'匯出影片',exact:true}).click();const dialog=page.getByRole('dialog',{name:'匯出影片',exact:true});await dialog.getByRole('button',{name:'關閉',exact:true}).hover();await expect(tooltip).toHaveText('關閉');await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
  await dialog.getByRole('button',{name:'關閉',exact:true}).click();await expect(dialog).toHaveCount(0);
});

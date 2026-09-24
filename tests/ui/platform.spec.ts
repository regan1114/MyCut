import {test,expect} from '@playwright/test';

test('Windows renderer uses Ctrl shortcuts, normal title spacing and server encoder capabilities',async({page})=>{
 // This checks renderer branches only. It does not simulate native Windows execution.
 await page.addInitScript(()=>{(window as any).mycut={platform:'win32'};});
 await page.route('**/api/health',route=>route.fulfill({json:{ok:true,platform:'win32',arch:'x64',encoders:['libx264']}}));
 await page.goto('/');await expect(page.locator('.project-home')).toHaveClass(/desktop-win32/);
 await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();
 await expect(page.getByRole('button',{name:'復原（Ctrl+Z）',exact:true})).toBeVisible();
 await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();
 await page.getByRole('button',{name:'櫻花',exact:true}).click();
 await page.locator('.preview-stage canvas').click();await page.keyboard.press('Control+z');
 await expect(page.getByRole('button',{name:'櫻花',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.keyboard.press('Control+y');await expect(page.getByRole('button',{name:'櫻花',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();
 await expect(page.getByLabel('編碼器').locator('option')).toHaveCount(1);
 await expect(page.getByLabel('編碼器')).toHaveValue('libx264');
 await page.screenshot({path:'test-results/windows-renderer.png',fullPage:true});
});

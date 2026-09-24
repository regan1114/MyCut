import { expect, type Page } from '@playwright/test';
export async function openFonts(page:Page){const picker=page.locator('.font-picker');if(await picker.getAttribute('open')===null)await picker.locator('summary').click();await page.getByLabel('搜尋字型',{exact:true}).fill('');await page.getByRole('button',{name:'全部字型',exact:true}).click();}
export async function chooseFont(page:Page,id:string){await openFonts(page);await page.locator(`.font-card[data-font-id="${id}"] .font-choice`).click();}
export async function fontIs(page:Page,id:string){await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id',id);}

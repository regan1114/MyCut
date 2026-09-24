import { test, expect, type Page, type Locator } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

async function open(page: Page, p: Project) {
  expect((await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p })).ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
}
async function drag(page: Page, locator: Locator, delta: number) {
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}
const width = async (locator: Locator) => (await locator.boundingBox())!.width;

test('panel dividers resize all three panels, enforce minimums, survive window resize and support keyboard/cancel', async ({ page }) => {
  const p = newProject(); p.name = '面板寬度驗證';
  p.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, text: '面板寬度', duration: 108000 })];
  await open(page, p);
  const left = page.getByRole('separator', { name: '調整功能區與播放器寬度' }), right = page.getByRole('separator', { name: '調整播放器與屬性區寬度' });
  const library = page.locator('.library-panel'), player = page.locator('.preview-panel'), inspector = page.locator('.inspector');
  const originalPlayer = await width(player);
  await drag(page, left, 120); expect(await width(library)).toBeCloseTo(392); expect(await width(player)).toBeCloseTo(originalPlayer - 120);
  await drag(page, left, 1200); expect(await width(player)).toBeCloseTo(400, 1); expect(await width(inspector)).toBeCloseTo(270);
  await left.dblclick(); expect(await width(library)).toBeCloseTo(272);
  await drag(page, right, -200); expect(await width(inspector)).toBeCloseTo(470);
  await page.setViewportSize({ width: 1020, height: 740 });
  expect(await width(player)).toBeCloseTo(400, 1); expect(await width(library)).toBeGreaterThanOrEqual(220); expect(await width(inspector)).toBeGreaterThanOrEqual(240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await page.locator('.player-controls').evaluate(el => { const r = el.getBoundingClientRect(); return [...el.querySelectorAll('button')].every(b => { const box = b.getBoundingClientRect(); return box.x >= r.x && box.right <= r.right; }); }); expect(controls).toBe(true);
  await page.setViewportSize({ width: 1500, height: 950 }); expect(await width(library)).toBeCloseTo(272); expect(await width(inspector)).toBeCloseTo(470);
  await drag(page, left, -1000); expect(await width(library)).toBeCloseTo(220);
  await drag(page, right, 1000); expect(await width(inspector)).toBeCloseTo(240);
  await left.focus(); await page.keyboard.press('ArrowRight'); expect(await width(library)).toBeCloseTo(230); await expect(page.locator('.time-display b')).toHaveText('00:00:00:00');
  const box = (await left.boundingBox())!; await page.mouse.move(box.x + 3, box.y + 80); await page.mouse.down(); await page.mouse.move(box.x + 83, box.y + 80); await page.keyboard.press('Escape'); await page.mouse.up(); expect(await width(library)).toBeCloseTo(230); await expect(page.locator('.resizing')).toHaveCount(0);
  await right.focus(); await page.keyboard.press('ArrowLeft'); expect(await width(inspector)).toBeCloseTo(250);
  await page.locator('.clip-text').click(); await page.getByRole('button', { name: '字幕屬性' }).click();
  await page.screenshot({ path: 'test-results/panels-minimum-width.png', fullPage: true });
  await page.getByRole('button', { name: '返回專案首頁' }).click(); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click(); expect(await width(library)).toBeCloseTo(230); expect(await width(inspector)).toBeCloseTo(250);
});

test('caption properties only list and select; text tab edits selection and timeline uses live content', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const p = newProject(); p.name = '字幕屬性驗證';
  p.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, text: '第一行\n第二行', name: '新增文字', duration: 90 }), makeClip({ kind: 'text', trackId: 'text', start: 90, duration: 90, text: '第二句字幕', name: '新增字幕', captionType: 'captions' }), makeClip({ kind: 'shape', trackId: 'main', start: 0, duration: 180, name: '底圖' })];
  await open(page, p);
  await page.getByRole('button', { name: '第一行 第二行，00:00:00:00', exact: true }).click();
  await page.getByLabel('文字內容', { exact: true }).fill('真正的內容'); await expect(page.locator('.clip-text').first()).toHaveAccessibleName('真正的內容，00:00:00:00');
  const inspector = page.locator('.inspector'); await inspector.getByRole('button', { name: '字幕屬性' }).click();
  const list = inspector.getByRole('list', { name: '專案字幕清單' }); await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(inspector.locator('.inspector-tabs button')).toHaveText(['字幕', '文字', '動畫', '調色']);
  await expect(inspector.getByLabel('片段名稱')).toHaveCount(0);
  await expect(inspector.locator('textarea')).toHaveCount(0);
  await expect(inspector.getByText('字幕功能', { exact: true })).toHaveCount(0);
  await expect(inspector.getByText('目前字幕', { exact: true })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '逐字校時', exact: true })).toHaveCount(0);
  await page.getByLabel('搜尋字幕內容').fill('第二句');
  await list.getByRole('button', { name: /第二句字幕/ }).click();
  await expect(list.getByRole('button', { pressed: true })).toContainText('第二句字幕');
  await expect(page.locator('.time-display b')).toHaveText('00:00:03:00');
  await inspector.getByRole('button', { name: '文字', exact: true }).click();
  await expect(page.getByLabel('文字內容', { exact: true })).toHaveValue('第二句字幕');
  await expect(inspector.getByRole('button', { name: '逐字校時', exact: true })).toBeVisible();
  await page.getByLabel('文字內容', { exact: true }).fill('修改後的字幕');
  await expect(page.locator('.clip-text.selected')).toContainText('修改後的字幕');
  await page.getByLabel('文字內容', { exact: true }).fill(''); await expect(page.locator('.clip-text.selected')).toContainText('空白文字');
  await page.getByRole('button', { name: /^復原（/ }).click(); await expect(page.getByLabel('文字內容', { exact: true })).toHaveValue('修改後的字幕');
  await inspector.getByRole('button', { name: '字幕屬性' }).click();
  await expect(page.getByLabel('搜尋字幕內容')).toHaveValue('第二句');
  await expect(list.getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '清除字幕搜尋' }).click();
  await expect(list.getByRole('button', { pressed: true })).toContainText('修改後的字幕');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/caption-properties.png', fullPage: true });
  await page.getByRole('button', { name: '底圖，00:00:00:00', exact: true }).click(); await expect(inspector.getByRole('button', { name: '字幕屬性' })).toHaveCount(0); await expect(page.getByLabel('開始秒數')).toBeVisible();
  await inspector.getByRole('button', { name: '調色', exact: true }).click(); await page.locator('.clip-text').nth(1).click(); await expect(page.getByLabel('文字內容', { exact: true })).toHaveValue('修改後的字幕');
  await page.getByText('已儲存至本機', { exact: true }).waitFor(); await page.reload(); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click(); await expect(page.locator('.clip-text').nth(1)).toHaveAccessibleName('修改後的字幕，00:00:03:00'); expect(errors).toEqual([]);
});

test('an hour of captions is paginated and searchable without rendering the whole list', async ({ page }) => {
  const p = newProject(); p.name = '一小時字幕清單';
  p.clips = Array.from({ length: 1201 }, (_, i) => makeClip({ kind: 'text', trackId: 'text', start: i * 90, duration: 90, text: `字幕第 ${i + 1} 句`, name: '新增字幕', captionType: 'captions' }));
  await open(page, p); await page.locator('.clip-text').first().click(); await page.getByRole('button', { name: '字幕屬性' }).click();
  const list = page.getByRole('list', { name: '專案字幕清單' }); await expect(list.getByRole('listitem')).toHaveCount(50); await expect(page.locator('.caption-list-pages')).toContainText('1 / 25');
  await page.getByLabel('搜尋字幕內容').fill('第 1201 句'); await expect(list.getByRole('listitem')).toHaveCount(1); await list.getByRole('button').click(); await expect(list.getByRole('button', { pressed: true })).toContainText('字幕第 1201 句'); await expect(page.locator('.time-display b')).toHaveText('01:00:00:00'); await expect(page.getByLabel('搜尋字幕內容')).toHaveValue('第 1201 句'); await expect(list.getByRole('listitem')).toHaveCount(1); await page.getByRole('button',{name:'清除字幕搜尋'}).click(); await expect(page.locator('.caption-list-pages')).toContainText('25 / 25');
  await expect(page.locator('.clip-text.selected')).toContainText('字幕第 1201 句'); await page.getByRole('button', { name: '上一頁字幕' }).click(); await expect(list.getByRole('listitem')).toHaveCount(50); await expect(page.locator('.caption-list-pages')).toContainText('24 / 25');
  await page.locator('.inspector').getByRole('button', { name: '文字', exact: true }).click(); await expect(page.getByLabel('文字內容', { exact: true })).toHaveValue('字幕第 1201 句');
  await page.getByRole('button', { name: '字幕屬性' }).click(); await expect(page.locator('.caption-list-pages')).toContainText('24 / 25');
});

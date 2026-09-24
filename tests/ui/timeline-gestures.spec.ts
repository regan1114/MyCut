import { test, expect } from '@playwright/test';
import { makeClip, newProject, uid } from '../../shared/model';

test('marker clicks seek exactly, cancel stops scrubbing, and leaving editor removes gesture listeners', async ({ page }) => {
  const p = newProject(); p.name = '時間軸手勢清理'; p.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, duration: 900, text: '手勢驗證' })];
  p.markers = [{ id: uid(), frame: 300, name: '十秒標記' }];
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/'); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  const marker = page.getByRole('button', { name: '十秒標記（雙擊刪除）' });
  await marker.click(); await expect(page.locator('.time-display b')).toHaveText('00:00:10:00');
  await marker.dblclick(); await expect(marker).toHaveCount(0);
  const ruler = page.locator('.time-ruler'), box = (await ruler.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + 12);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  const canceledFrame = await page.locator('.time-display b').innerText(); await page.mouse.move(box.x + 250, box.y + 12); await page.mouse.up(); await expect(page.locator('.time-display b')).toHaveText(canceledFrame);
  // Simulate closing while pointer capture is still active; the next editor must not inherit it.
  await page.mouse.move(box.x + 80, box.y + 12); await page.mouse.down();
  await page.getByRole('button', { name: '返回專案首頁' }).evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('.project-home').waitFor(); await page.mouse.up(); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.mouse.move(800, 650); await expect(page.locator('.time-display b')).toHaveText('00:00:00:00');
});

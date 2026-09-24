import { test, expect } from '@playwright/test';
import { makeClip, newProject } from '../../shared/model';
import { chooseFont } from './font-helpers';
import { writeFile } from 'node:fs/promises';

test('long caption projects reuse static text pixels and load only visible fonts', async ({ page }) => {
  await page.addInitScript(() => {
    const stats = { canvases: 0, textPaints: 0, fontLoads: 0 };
    (window as any).previewStats = stats;
    const create = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => { if (tag === 'canvas') stats.canvases++; return create(tag, options); }) as typeof document.createElement;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) { stats.textPaints++; return fill.apply(this, args); };
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = (...args) => { stats.fontLoads++; return load(...args); };
  });
  const p = newProject(); p.name = '長字幕預覽效能';
  p.clips = Array.from({ length: 1201 }, (_, i) => makeClip({ kind: 'text', trackId: 'text', start: i * 90, duration: 90, text: `字幕 ${i + 1}` }));
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/'); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.getByText('已儲存至本機', { exact: true }).waitFor();
  const initialFontLoads = await page.evaluate(() => (window as any).previewStats.fontLoads);
  const pixels = () => page.locator('.canvas-wrap canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const firstImage = await pixels();
  await page.evaluate(() => { (window as any).previewStats.canvases = 0; (window as any).previewStats.textPaints = 0; });
  await page.getByRole('button', { name: '播放（Space）', exact: true }).click();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: '暫停（Space）', exact: true }).click();
  const playback = await page.evaluate(() => ({ ...(window as any).previewStats }));
  expect(await pixels()).toBe(firstImage);
  await page.locator('.clip-text').first().click(); await page.getByLabel('文字內容', { exact: true }).fill('修改後的字幕');
  await page.getByText('已儲存至本機', { exact: true }).waitFor();
  const editFontLoads = await page.evaluate(() => (window as any).previewStats.fontLoads);
  expect(await pixels()).not.toBe(firstImage);
  const result = { initialFontLoads, newCanvasesDuringPlayback: playback.canvases, textPaintsDuringPlayback: playback.textPaints, fontLoadsAfterEdit: editFontLoads, captionCount: 1201 };
  console.log('Preview measurements:', JSON.stringify(result));
  await writeFile(`test-results/preview-performance${process.env.MYCUT_BASELINE ? '-before' : ''}.json`, JSON.stringify(result, null, 2));
  if (process.env.MYCUT_BASELINE) return;
  expect(initialFontLoads).toBeLessThanOrEqual(2);
  expect(playback.canvases).toBeLessThanOrEqual(1);
  expect(playback.textPaints).toBeLessThanOrEqual(1);
  expect(editFontLoads).toBe(initialFontLoads);
});

test('cached preview still updates karaoke, text styles, seeking and portrait aspect ratio', async ({ page }) => {
  const p = newProject(); p.name = '歌詞與直式預覽快取'; p.width = 1080; p.height = 1920;
  p.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, duration: 120, text: '星光', fontSize: 180, karaoke: { enabled: true, words: [{ text: '星', start: 0, end: 60 }, { text: '光', start: 60, end: 120 }], color: '#ffe27a', offset: 0, source: 'manual' } })];
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/'); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.waitForFunction(() => document.fonts.status === 'loaded'); await page.getByText('已儲存至本機', { exact: true }).waitFor();
  const canvas = page.locator('.canvas-wrap canvas'), pixels = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const initial = await pixels(); await page.keyboard.press('Shift+ArrowRight'); expect(await pixels()).not.toBe(initial);
  await page.getByRole('button', { name: '回到開頭', exact: true }).click(); expect(await pixels()).toBe(initial);
  await page.locator('.clip-text').click(); await page.getByLabel('字級', { exact: true }).focus(); await page.keyboard.press('Home'); expect(await pixels()).not.toBe(initial);
  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  expect(size.width).toBeLessThanOrEqual(960); expect(size.height).toBeLessThanOrEqual(540); expect(size.width / size.height).toBeCloseTo(1080 / 1920, 2);
  await page.getByLabel('字級', { exact: true }).focus(); await page.keyboard.press('End');
  const beforeFont = await pixels();
  await page.route('**/fonts/huninn/*', async route => { await new Promise(resolve => setTimeout(resolve, 200)); await route.continue(); });
  await chooseFont(page, 'huninn'); await page.waitForFunction(() => document.fonts.status === 'loaded');
  await expect.poll(pixels).not.toBe(beforeFont);
  await page.keyboard.press('Shift+ArrowRight');
  await page.screenshot({ path: 'test-results/optimized-portrait-preview.png', fullPage: true });
});

test('many simultaneous text layers have a bounded surface budget and release old caption pixels on seek', async ({ page }) => {
  await page.addInitScript(() => {
    const canvases: HTMLCanvasElement[] = []; (window as any).previewCanvases = canvases;
    const create = document.createElement.bind(document);
    document.createElement = ((tag: string, options?: ElementCreationOptions) => { const el = create(tag, options); if (el instanceof HTMLCanvasElement) canvases.push(el); return el; }) as typeof document.createElement;
  });
  const p = newProject(); p.name = '多層文字記憶體上限';
  p.clips = Array.from({ length: 42 }, (_, i) => makeClip({ kind: 'text', trackId: 'text', start: Math.floor(i / 14) * 60, duration: 60, text: `文字圖層 ${i}`, y: (i % 14 - 7) / 30, fontSize: 30 }));
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/'); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.waitForFunction(() => document.fonts.status === 'loaded'); await page.getByText('已儲存至本機', { exact: true }).waitFor();
  const pixels = () => page.locator('.canvas-wrap canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const first = await pixels();
  const checkBudget = async () => {
    const size = await page.evaluate(() => (window as any).previewCanvases.reduce((total: number, c: HTMLCanvasElement) => total + c.width * c.height, 0));
    expect(size).toBeLessThanOrEqual(10 * 960 * 540); // Main canvas + 8 cached layers + 1 reusable overflow layer.
  };
  await checkBudget();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+ArrowRight'); await checkBudget(); }
  expect(await pixels()).not.toBe(first);
  await page.getByRole('button', { name: '回到開頭', exact: true }).click(); await checkBudget(); expect(await pixels()).toBe(first);
});

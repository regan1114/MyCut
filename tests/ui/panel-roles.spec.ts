import { test, expect, type Page } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function open(page: Page, project: Project) {
  expect((await page.request.put(`/api/projects/${project.id}`, { headers: { 'X-MyCut': '1' }, data: project })).ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
}
async function saved(page: Page, project: Project): Promise<Project> {
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeVisible();
  return (await page.request.get(`/api/projects/${project.id}`)).json();
}

test('left effects catalog and right properties keep global and timed settings separate', async ({ page }) => {
  const p = newProject(); p.name = '左右特效分工';
  p.clips = [makeClip({ kind: 'shape', trackId: 'main', start: 0, duration: 180, name: '底圖' })];
  await open(page, p);
  const nav = page.getByRole('navigation'), left = page.locator('.library-panel'), right = page.locator('.inspector');
  await page.locator('.clip-shape').click();
  await nav.getByRole('button', { name: '特效', exact: true }).click();
  await expect(right.locator('.panel-header')).toContainText('全片特效屬性');
  await expect(left.locator('input,select')).toHaveCount(0); await expect(right.locator('.fx-card')).toHaveCount(0);
  await left.getByRole('button', { name: '櫻花', exact: true }).click();
  await right.getByLabel('特效品質', { exact: true }).selectOption('draft');
  await left.getByRole('button', { name: '時段特效', exact: true }).click();
  await left.getByRole('button', { name: '雨絲', exact: true }).click();
  await expect(right.locator('.panel-header')).toContainText('特效片段');
  await expect(right.getByLabel('特效品質', { exact: true })).toHaveValue('standard');
  await right.getByLabel('特效品質', { exact: true }).selectOption('high');
  await left.getByRole('button', { name: '全片效果', exact: true }).click();
  await expect(right.getByLabel('特效品質', { exact: true })).toHaveValue('draft');
  await page.locator('.clip-effect').click(); await expect(right.getByLabel('特效品質', { exact: true })).toHaveValue('high');
  await left.getByRole('button', { name: '精靈粒子', exact: true }).click();
  await expect(right.locator('.panel-header')).toContainText('全片特效屬性');
  await page.getByRole('button', { name: /^復原（/ }).click();
  const result = await saved(page, p);
  expect(result.effects.enabled).toEqual(['sakura']); expect(result.effects.quality).toBe('draft');
  expect(result.clips.find(c => c.kind === 'effect')!.effects!.quality).toBe('high');
  await page.setViewportSize({ width: 1020, height: 740 });
  for (const name of ['調整功能區與播放器寬度', '調整播放器與屬性區寬度']) await page.getByRole('separator', { name }).press('Home');
  for (const panel of [left, right]) expect(await panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/panel-roles-effects.png', fullPage: true });
});

test('audio actions live on left, clip properties on right, and keyframes use one transform editor', async ({ page }) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mycut-panel-audio-')), file = path.join(root, '有聲影片.mp4');
  try {
    await promisify(execFile)(createRequire(import.meta.url)('ffmpeg-static'), ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', file]);
    const upload = await page.request.post('/api/media/upload', { headers: { 'X-MyCut': '1' }, multipart: { file: { name: '有聲影片.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(file) } } });
    expect(upload.ok()).toBeTruthy(); const media = await upload.json();
    const p = newProject(); p.name = '左右音訊分工';
    p.clips = [makeClip({ kind: 'video', trackId: 'main', mediaId: media.imported[0], start: 0, duration: 60, name: '有聲影片' }), makeClip({ kind: 'shape', trackId: 'overlay', start: 0, duration: 60, name: '圖形' })];
    await open(page, p);
    const left = page.locator('.library-panel'), right = page.locator('.inspector');
    await page.getByRole('navigation').getByRole('button', { name: '音訊', exact: true }).click();
    await expect(left.getByRole('button', { name: '分離音訊', exact: true })).toBeDisabled();
    await page.locator('.clip-video').click();
    await right.getByRole('button', { name: '音訊', exact: true }).click();
    await expect(right.getByRole('button', { name: '分離音訊', exact: true })).toHaveCount(0);
    await expect(left.getByLabel('音量', { exact: true })).toHaveCount(0);
    await left.getByRole('button', { name: '分離音訊', exact: true }).click();
    await expect(page.locator('.clip-audio')).toHaveCount(1);
    let result = await saved(page, p); const video = result.clips.find(c => c.kind === 'video')!, audio = result.clips.find(c => c.kind === 'audio')!;
    expect(video.volume).toBe(0); expect(audio.volume).toBe(1); expect(video.linkId).toBe(audio.linkId); expect(video.linkId).toBeTruthy();
    await right.getByRole('button', { name: '基本', exact: true }).click(); await expect(right.getByLabel('音量', { exact: true })).toHaveCount(0);
    await right.getByRole('button', { name: '音訊', exact: true }).click(); await expect(right.getByLabel('音量', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: /^復原（/ }).click(); await expect(page.locator('.clip-audio')).toHaveCount(0);
    await page.locator('.clip-shape').click(); await expect(right.getByRole('button', { name: '音訊', exact: true })).toHaveCount(0);
    await right.getByRole('button', { name: '動畫', exact: true }).click(); await expect(right.getByLabel('縮放', { exact: true })).toHaveCount(0);
    await right.getByRole('button', { name: '新增關鍵影格', exact: true }).click();
    await right.getByRole('button', { name: '基本', exact: true }).click(); await right.getByLabel('縮放', { exact: true }).focus(); await page.keyboard.press('End');
    result = await saved(page, p); expect(result.clips.find(c => c.kind === 'shape')!.keyframes[0].scale).toBe(4); expect(result.clips.find(c => c.kind === 'video')!.volume).toBe(1);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

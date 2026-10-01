import { test, expect, type Page } from '@playwright/test';
import { makeClip, newProject, parseSrt, type Project } from '../../shared/model';

async function open(page: Page, project: Project) {
  expect((await page.request.put(`/api/projects/${project.id}`, { headers: { 'X-MyCut': '1' }, data: project })).ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
}
async function downloadSrt(page: Page) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 SRT', exact: true }).click();
  const file = await waiting;
  let text = ''; for await (const chunk of (await file.createReadStream())!) text += chunk;
  return { name: file.suggestedFilename(), text };
}

test('one SRT entry exports the chosen scope in timeline order without inventing pending timings', async ({ page }) => {
  const project = newProject(); project.name = '字幕匯出範圍';
  project.clips = [
    makeClip({ kind: 'text', trackId: 'text', start: 108015, duration: 60, text: '最後一句歌詞', captionType: 'lyrics' }),
    makeClip({ kind: 'text', trackId: 'main', start: 0, duration: 90, text: '片頭標題' }),
    makeClip({ kind: 'text', trackId: 'text', start: 30, duration: 60, text: '第一句字幕', captionType: 'captions' }),
  ];
  project.pendingLyrics = [{ jobId: crypto.randomUUID(), mode: 'lyrics', duration: 3603, lines: [{ id: 93, text: '仍待校時的原文', reason: '未取得有效時間' }] }];
  await open(page, project);
  const entry = page.getByRole('button', { name: '匯出 SRT 字幕', exact: true });
  await expect(entry).toHaveCount(1); await expect(page.getByRole('button', { name: '目前字幕 SRT', exact: true })).toHaveCount(0);
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '匯出 SRT 字幕', exact: true });
  await expect(dialog.getByLabel('字幕匯出範圍')).toHaveValue('captions'); await expect(dialog).toContainText('另有 1 句待手動校時');
  const captions = await downloadSrt(page);
  expect(captions.name).toBe(`${project.name}.srt`);
  expect(parseSrt(captions.text, project.fps).map(c => c.text)).toEqual(['第一句字幕', '最後一句歌詞']);
  expect(captions.text).toContain('01:00:00,500 --> 01:00:02,500'); expect(captions.text).not.toContain('仍待校時的原文');
  await entry.click(); await dialog.getByLabel('字幕匯出範圍').selectOption('all');
  await page.setViewportSize({ width: 1020, height: 740 });
  await page.screenshot({ path: 'test-results/caption-export-scopes.png', fullPage: true });
  const all = await downloadSrt(page);
  expect(parseSrt(all.text, project.fps).map(c => c.text)).toEqual(['片頭標題', '第一句字幕', '最後一句歌詞']);
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeAttached();
  const saved = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(saved.clips).toEqual(project.clips); expect(saved.pendingLyrics).toEqual(project.pendingLyrics);
});

test('an empty subtitle scope explains how to export titles and supports cancellation', async ({ page }) => {
  const project = newProject(); project.name = '只有標題的匯出';
  project.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, duration: 90, text: '一般文字標題' })];
  await open(page, project); await page.getByRole('button', { name: '匯出 SRT 字幕', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '匯出 SRT 字幕', exact: true });
  await expect(dialog.getByRole('button', { name: '下載 SRT' })).toBeDisabled(); await expect(dialog).toContainText('此範圍沒有字幕');
  await dialog.getByLabel('字幕匯出範圍').selectOption('all'); await expect(dialog.getByRole('button', { name: '下載 SRT' })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

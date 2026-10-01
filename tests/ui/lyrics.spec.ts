import { test, expect } from '@playwright/test';
import { newProject, makeClip } from '../../shared/model';
import { audioSignature } from '../../shared/captions';

const timeline = {
  version: '1.0.0',
  mode: 'known_lyrics',
  duration: 5,
  segments: [
    {
      id: 1,
      start: 1,
      end: 2,
      text: '月滿',
      words: [
        { text: '月', start: 1, end: 1.4 },
        { text: '滿', start: 1.4, end: 2 },
      ],
    },
    { id: 2, start: 3, end: 4, text: '歸來' },
  ],
};

test('partial alignment keeps valid cues, persists manual lines, and supports timing, undo and export', async ({ page }) => {
  const project = newProject();
  project.name = '部分歌詞手動校時';
  project.clips = [makeClip({ kind: 'shape', trackId: 'main', start: 0, duration: 150 })];
  const jobId = crypto.randomUUID();
  await page.route('**/api/lyrics/align', (route) => route.fulfill({ json: { id: jobId, status: 'preparing' } }));
  await page.route(`**/api/lyrics/jobs/${jobId}`, (route) => route.fulfill({ json: {
    id: jobId, projectId: project.id, signature: audioSignature(project, []), status: 'done',
    message: '已定位 2 句，1 句待手動校時。', progress: { percent: 100 },
    timeline: { ...timeline, unmatched: [{ id: 93, text: '等我歸來', reason: '未取得有效時長（開始 4.000 秒，結束 4.000 秒）。' }] },
  } }));
  await page.request.put(`/api/projects/${project.id}`, { headers: { 'X-MyCut': '1' }, data: project });
  const open = async () => {
    await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  };
  await page.goto('/'); await open();
  await page.getByRole('button', { name: '自動歌詞', exact: true }).click();
  await page.getByRole('button', { name: '輸入原稿並對齊' }).click();
  await page.getByLabel('原稿內容').fill('月滿\n歸來\n等我歸來');
  await page.getByRole('button', { name: '依原稿對齊音源' }).click();
  await expect(page.getByRole('dialog', { name: '輸入原稿' })).toHaveCount(0);
  await expect(page.locator('.clip-text')).toHaveCount(2);
  let row = page.getByRole('article', { name: '待校時第 93 行' });
  await expect(row).toContainText('等我歸來');
  await expect(row.getByRole('button', { name: '加入時間軸' })).toBeDisabled();
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeVisible();
  const initial = await (await page.request.get(`/api/projects/${project.id}`)).json();
  await page.getByRole('button', { name: '返回專案首頁' }).click();
  await page.reload(); await open();
  row = page.getByRole('article', { name: '待校時第 93 行' });
  await expect(row).toBeVisible();
  await page.getByLabel('第 93 行以目前時間設定開始').click();
  await expect(page.getByLabel('第 93 行開始秒數')).toHaveValue('0.000');
  await page.getByLabel('第 93 行開始秒數').fill('4.1');
  await page.getByLabel('第 93 行結束秒數').fill('4');
  await expect(row.getByRole('button', { name: '加入時間軸' })).toBeDisabled();
  await page.getByLabel('第 93 行結束秒數').fill('4.8');
  await row.getByRole('button', { name: '試聽這段' }).click();
  await expect(page.locator('.time-display b')).toHaveText('00:00:04:24');
  await page.getByLabel('第 93 行以目前時間設定結束').click();
  await expect(page.getByLabel('第 93 行結束秒數')).toHaveValue('4.800');
  await page.screenshot({ path: 'test-results/lyrics-manual-timing.png', fullPage: true });
  await row.getByRole('button', { name: '加入時間軸' }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator('.clip-text')).toHaveCount(3);
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeVisible();
  const saved = await (await page.request.get(`/api/projects/${project.id}`)).json();
  for (const clip of initial.clips) expect(saved.clips.find((item: any) => item.id === clip.id)).toEqual(clip);
  expect(saved.clips.find((clip: any) => clip.text === '等我歸來')).toMatchObject({ start: 123, duration: 21, karaoke: { source: 'manual', enabled: false } });
  expect(saved.pendingLyrics).toEqual([]);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 SRT 字幕', exact: true }).click();
  await page.getByRole('button', { name: '下載 SRT', exact: true }).click();
  const file = await waiting;
  let contents = ''; for await (const part of (await file.createReadStream())!) contents += part;
  expect(contents).toContain('00:00:04,100 --> 00:00:04,800\n等我歸來');
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(page.getByRole('article', { name: '待校時第 93 行' })).toBeVisible();
  await expect(page.locator('.clip-text')).toHaveCount(2);
});

test('entirely unaligned JSON keeps every line for manual timing and round trips through export', async ({ page }) => {
  const project = newProject(); project.name = '全篇待手動校時';
  await page.request.put(`/api/projects/${project.id}`, { headers: { 'X-MyCut': '1' }, data: project });
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  const partial = { ...timeline, segments: [], unmatched: [{ id: 1, text: '月滿', reason: '未取得有效時間。' }, { id: 2, text: '歸來', reason: '未取得有效時間。' }] };
  await page.getByLabel('匯入 Timeline JSON 或 SRT').setInputFiles({ name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partial)) });
  await expect(page.locator('.lyrics-pending-row')).toHaveCount(2);
  await expect(page.locator('.clip-text')).toHaveCount(0);
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: '目前字幕 JSON', exact: true }).click();
  const file = await waiting;
  let contents = ''; for await (const part of (await file.createReadStream())!) contents += part;
  expect(JSON.parse(contents).unmatched).toEqual(partial.unmatched);
  await page.getByLabel('第 1 行開始秒數').fill('1');
  await page.getByLabel('第 1 行結束秒數').fill('2');
  await page.getByRole('article', { name: '待校時第 1 行' }).getByRole('button', { name: '加入時間軸' }).click();
  await expect(page.locator('.clip-text')).toHaveCount(1);
  await expect(page.locator('.lyrics-pending-row')).toHaveCount(1);
});
test('known lyrics reuse the shared text track; JSON, edits, segment playback and project reload stay in sync', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const project = newProject();
  project.name = '共用歌詞時間軸驗證';
  const background = makeClip({
    kind: 'shape',
    trackId: 'main',
    start: 0,
    duration: 150,
    name: '保留畫面',
  });
  project.clips = [background];
  const jobId = crypto.randomUUID();
  await page.route('**/api/lyrics/align', async (route) => {
    const data = route.request().postDataJSON();
    expect(data.options).toEqual({
      lyrics: '月滿\n歸來',
      mode: 'lyrics',
      preserve_lines: true,
    });
    await route.fulfill({ json: { id: jobId, status: 'preparing' } });
  });
  await page.route(`**/api/lyrics/jobs/${jobId}`, (route) =>
    route.fulfill({
      json: {
        id: jobId,
        projectId: project.id,
        signature: audioSignature(project, []),
        status: 'done',
        message: '對齊完成',
        progress: { percent: 100 },
        timeline,
      },
    }),
  );
  expect(
    (
      await page.request.put(`/api/projects/${project.id}`, {
        headers: { 'X-MyCut': '1' },
        data: project,
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  await expect(page.getByLabel('匯入 Timeline JSON 或 SRT')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '匯入 SRT 字幕', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '自動歌詞', exact: true }).click();
  await page.getByRole('button', { name: '輸入原稿並對齊' }).click();
  await expect(page.getByText(/Suno 的 \[Verse\]/)).toBeVisible();
  await expect(page.getByRole('button', { name: '依原稿對齊音源', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '沒有原稿，開始自動辨識', exact: true })).toHaveCount(0);
  await page.getByLabel('原稿內容').fill('[Verse 1]\n月滿\n[Chorus]\n歸來');
  await page.getByRole('button', { name: '依原稿對齊音源' }).click();
  await expect(page.locator('.track-header').filter({ hasText: '文字與字幕' })).toHaveCount(1);
  await expect(page.locator('.lyrics-source-panel [role="status"]')).toContainText('已略過 2 個 Suno 段落標記');
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeVisible();
  let saved = await (await page.request.get(`/api/projects/${project.id}`)).json();
  expect(saved.clips.find((clip: any) => clip.id === background.id)).toEqual(background);
  expect(saved.clips.find((clip: any) => clip.text === '月滿').karaoke.words).toHaveLength(2);
  await page.locator('.clip-text').filter({ hasText: '月滿' }).click();
  await page.getByRole('button', { name: '播放所選字幕' }).click();
  await expect(page.locator('.time-display b')).toHaveText('00:00:02:00');
  await page.waitForTimeout(200);
  await expect(page.locator('.time-display b')).toHaveText('00:00:02:00');
  const readDownload = async (label: string) => {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const file = await waiting;
    let contents = '';
    for await (const part of (await file.createReadStream())!) contents += part;
    return contents;
  };
  expect(JSON.parse(await readDownload('目前字幕 JSON')).segments[0].words).toHaveLength(2);
  await page.locator('.inspector').getByRole('button', { name: '文字', exact: true }).click();
  await page.getByLabel('文字內容', { exact: true }).fill('月明');
  const edited = JSON.parse(await readDownload('目前字幕 JSON'));
  expect(edited.segments[0].text).toBe('月明');
  expect(edited.segments[0].words).toBeUndefined();
  await page.getByRole('button', { name: '匯出 SRT 字幕', exact: true }).click();
  expect(await readDownload('下載 SRT')).toContain('00:00:01,000 --> 00:00:02,000\n月明');
  await page.screenshot({ path: 'test-results/known-lyrics-editor.png', fullPage: true });
  await page.getByRole('button', { name: '返回專案首頁' }).click();
  await page.reload();
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await expect(page.locator('.clip-text').filter({ hasText: '月明' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('timeline JSON imports and cancellation never applies late results', async ({ page }) => {
  const project = newProject();
  project.name = '歌詞匯入與取消';
  const id = crypto.randomUUID();
  let cancelled = false;
  await page.route('**/api/lyrics/align', (route) =>
    route.fulfill({ json: { id, status: 'preparing' } }),
  );
  await page.route(`**/api/lyrics/jobs/${id}`, (route) =>
    route.fulfill({
      json: { id, status: 'processing', message: '正在對齊歌詞', progress: { percent: 20 } },
    }),
  );
  await page.route(`**/api/lyrics/jobs/${id}/cancel`, (route) => {
    cancelled = true;
    return route.fulfill({ json: { status: 'cancelled' } });
  });
  await page.request.put(`/api/projects/${project.id}`, {
    headers: { 'X-MyCut': '1' },
    data: project,
  });
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  await page.getByRole('button', { name: '自動歌詞', exact: true }).click();
  await page.getByRole('button', { name: '輸入原稿並對齊' }).click();
  await page.getByLabel('原稿內容').fill('月滿');
  await page.getByRole('button', { name: '依原稿對齊音源' }).click();
  await expect(page.getByRole('status')).toContainText('正在對齊歌詞');
  await page.getByRole('button', { name: '取消原稿對齊' }).click();
  await expect.poll(() => cancelled).toBe(true);
  await expect(page.locator('.clip-text')).toHaveCount(0);
  await page.getByLabel('匯入 Timeline JSON 或 SRT').setInputFiles({
    name: 'lyrics.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(timeline)),
  });
  await expect(page.locator('.clip-text')).toHaveCount(2);
});

test('late creation from a cancelled request cannot replace the next active job ID', async ({
  page,
}) => {
  const project = newProject();
  project.name = '取消後立即重試';
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  let release = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const cancelled: string[] = [];
  await page.route('**/api/lyrics/align', async (route) => {
    const index = ++calls;
    if (index === 1) await delayed;
    await route.fulfill({ json: { id: index === 1 ? first : second, status: 'preparing' } });
  });
  await page.route(`**/api/lyrics/jobs/${second}`, (route) =>
    route.fulfill({
      json: {
        id: second,
        status: 'processing',
        message: '第二個工作正在對齊',
        progress: { percent: 20 },
      },
    }),
  );
  for (const id of [first, second])
    await page.route(`**/api/lyrics/jobs/${id}/cancel`, (route) => {
      cancelled.push(id);
      return route.fulfill({ json: { status: 'cancelled' } });
    });
  await page.request.put(`/api/projects/${project.id}`, {
    headers: { 'X-MyCut': '1' },
    data: project,
  });
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${project.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  await page.getByRole('button', { name: '自動歌詞', exact: true }).click();
  await page.getByRole('button', { name: '輸入原稿並對齊' }).click();
  await page.getByLabel('原稿內容').fill('月滿');
  await page.getByRole('button', { name: '依原稿對齊音源' }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole('button', { name: '取消原稿對齊' }).click();
  await page.getByRole('button', { name: '依原稿對齊音源' }).click();
  await expect(page.getByRole('status')).toContainText('第二個工作正在對齊');
  release();
  await expect.poll(() => cancelled.includes(first)).toBe(true);
  await page.getByRole('button', { name: '取消原稿對齊' }).click();
  await expect.poll(() => cancelled.includes(second)).toBe(true);
  await expect(page.locator('.clip-text')).toHaveCount(0);
});

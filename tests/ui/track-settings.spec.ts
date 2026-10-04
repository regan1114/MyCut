import { test } from '@playwright/test';
import { checkTextTracks, checkMediaTracks } from './track-settings-checks';

test('text appearance syncs within one track through undo, batch editing, insertion and reload',async({page})=>{
  await page.goto('/');await checkTextTracks(page);
});
test('video image and audio collisions create compatible lanes without changing time',async({page})=>{
  await page.goto('/');await checkMediaTracks(page);
});

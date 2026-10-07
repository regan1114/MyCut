import { test } from '@playwright/test';
import { checkPreviewDrag } from './editor-gestures-checks';

for(const animated of [false,true])test(`a logo drags over a background, saves and supports undo${animated?' with keyframes':''}`,async({page})=>{
  await page.goto('/');await checkPreviewDrag(page,animated);
});

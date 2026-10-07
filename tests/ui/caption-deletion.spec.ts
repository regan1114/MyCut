import { test } from '@playwright/test';
import { checkCaptionDeletion } from './caption-deletion-checks';

test('caption rows delete only their content, respect locked tracks and support undo and persistence',async({page})=>{
  await page.goto('/');await checkCaptionDeletion(page);
});

import { test } from '@playwright/test';
import { checkInspectorNumbers } from './inspector-numbers-checks';

test('text transform numbers accept direct entry, validate bounds and persist with undo',async({page})=>{
  await page.goto('/');await checkInspectorNumbers(page);
});

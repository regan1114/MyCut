import { test } from '@playwright/test';
import { checkTimelineWheelZoom } from './timeline-wheel-checks';

test('Option or Alt wheel zooms throughout the timeline and retains the pointer time',async({page})=>{
  await page.goto('/');await checkTimelineWheelZoom(page);
});

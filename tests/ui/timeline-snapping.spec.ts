import { test } from '@playwright/test';
import { checkTrimSnapping, checkGroupSnapping } from './timeline-snapping-checks';

for(const position of ['above','below'] as const)for(const edge of ['left','right'] as const){
  test(`${edge} trim snaps to a clip ${position}, releases and honors the toggle`,async({page})=>{
    await page.goto('/');await checkTrimSnapping(page,position,edge);
  });
}
test('moving a group snaps the edge of another selected clip without changing offsets',async({page})=>{
  await page.goto('/');await checkGroupSnapping(page);
});

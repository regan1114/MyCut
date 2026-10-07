import { test } from '@playwright/test';
import { checkImageAudioSnapping } from './image-audio-snapping-checks';

for(const track of ['main','logo'] as const)test(`an imported ${track} image extends and snaps to the end of a long audio clip`,async({page})=>{
  await page.goto('/');await checkImageAudioSnapping(page,track);
});
test('image trimming snaps to the audio end in a horizontally scrolled timeline',async({page})=>{
  await page.goto('/');await checkImageAudioSnapping(page,'main',true);
});

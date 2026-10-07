import { test, expect } from '@playwright/test';
import { checkTimelineWheelRecovery, checkTimelineWheelZoom } from './timeline-wheel-checks';

for(const [platform,key,modifier,splitShortcut] of [['MacIntel','Meta','Command','⌘B'],['Win32','Alt','Alt','Ctrl+B']] as const){
  test(`${modifier} wheel zooms throughout the ${platform} timeline and retains the pointer time`,async({page})=>{
    await page.addInitScript(value=>Object.defineProperty(navigator,'platform',{get:()=>value}),platform);
    await page.goto('/');await checkTimelineWheelZoom(page,key);
    await expect(page.getByRole('button',{name:`分割（${splitShortcut}）`,exact:true})).toBeVisible();
  });
  for(const scenario of ['modifier','axis','interrupted-gesture'] as const)test(`${modifier} wheel handles ${scenario} input on ${platform}`,async({page})=>{
    await page.addInitScript(value=>Object.defineProperty(navigator,'platform',{get:()=>value}),platform);
    await page.goto('/');await checkTimelineWheelRecovery(page,scenario,key);
  });
}

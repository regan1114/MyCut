import { shortcutLabel } from '../shared/platform';

export const platform=window.reelume?.platform ?? (/Mac/i.test(navigator.platform)?'darwin':'win32');
export const desktopClass=window.reelume ? `desktop desktop-${platform}` : '';
export const shortcut=(key:string,shift=false)=>shortcutLabel(platform,key,shift);

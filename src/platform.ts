import { shortcutLabel } from '../shared/platform';

export const platform=window.mycut?.platform ?? (/Mac/i.test(navigator.platform)?'darwin':'win32');
export const desktopClass=window.mycut ? `desktop desktop-${platform}` : '';
export const shortcut=(key:string,shift=false)=>shortcutLabel(platform,key,shift);

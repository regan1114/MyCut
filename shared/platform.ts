import type { ExportSettings } from './model';

// ASAR paths use the host separator; native processes cannot read inside ASAR.
export function unpackedPath(value:string):string {
  return value.replace(/(^|[/\\])app\.asar(?=[/\\])/g, '$1app.asar.unpacked');
}

export function safeFileName(value:string):string {
  const name=value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/g,'').slice(0,120).replace(/[. ]+$/g,'') || 'MyCut';
  return /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ? '_'+name : name;
}

export function availableEncoders(platform:string):ExportSettings['encoder'][] {
  return platform==='darwin' ? ['libx264','h264_videotoolbox'] : ['libx264'];
}

export function requireEncoder(encoder:ExportSettings['encoder'],platform:string):void {
  if(!availableEncoders(platform).includes(encoder))throw new Error('此電腦不支援所選編碼器，請改用軟體編碼建立新的匯出工作。');
}

export function shortcutLabel(platform:string,key:string,shift=false):string {
  return platform==='darwin' ? `⌘${shift?'⇧':''}${key}` : `Ctrl+${shift?'Shift+':''}${key}`;
}

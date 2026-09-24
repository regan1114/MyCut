import fs from 'node:fs/promises';
import {NtExecutable,NtExecutableResource} from 'resedit';

// whisper.cpp takes narrow argv and opens JSON output with std::ofstream.
// UTF-8 process code pages make Chinese user folders work without OS changes.
export async function enableUtf8Paths(file){
  const executable=NtExecutable.from(await fs.readFile(file));
  const resources=NtExecutableResource.from(executable);
  let entry=resources.entries.find(e=>e.type===24&&e.id===1);
  let xml=entry?Buffer.from(entry.bin).toString('utf8'):'<?xml version="1.0" encoding="UTF-8"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"></assembly>';
  if(xml.includes('activeCodePage'))return;
  const application='<application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><activeCodePage xmlns="http://schemas.microsoft.com/SMI/2019/WindowsSettings">UTF-8</activeCodePage><longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings></application>';
  xml=xml.replace('</assembly>',application+'</assembly>');
  const bytes=Buffer.from(xml);const bin=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  if(entry)entry.bin=bin;else resources.entries.push({type:24,id:1,lang:1033,codepage:65001,bin});
  resources.outputResource(executable);await fs.writeFile(file,Buffer.from(executable.generate()));
}

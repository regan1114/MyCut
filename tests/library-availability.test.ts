import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { Library } from '../server/library';

test('reimport restores missing status without changing media identity; absent sources still fail',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-availability-')),file=path.join(root,'logo.png'),moved=file+'.moved';let library=new Library(root);
 try{await library.init();await fs.writeFile(file,createCanvas(20,20).toBuffer('image/png'));const original=await library.import(file);await fs.rename(file,moved);library.close();library=new Library(root);await library.init();assert.equal(library.get(original.id).missing,true);
 await assert.rejects(library.import(file));await fs.rename(moved,file);const restored=await library.import(file);assert.equal(restored.id,original.id);assert.equal(restored.missing,false);assert.equal(library.list().length,1);
 await fs.rename(file,moved);assert.equal((await library.refresh())[0].missing,true);await fs.rename(moved,file);assert.equal((await library.refresh())[0].missing,false);
 await fs.rm(file);await fs.mkdir(file);assert.equal((await library.refresh())[0].missing,true);await assert.rejects(library.import(file));
 }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});

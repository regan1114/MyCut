import { startServer } from '../server/index';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-ui-test-'));
const server=await startServer({root,port:4319});console.log('UI test server ready');
process.on('SIGTERM',()=>{server.close();process.exit(0);});

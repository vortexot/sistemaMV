import { build } from 'rolldown';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.sites-runtime',{recursive:true});
await build({input:'worker/worker.test.ts',platform:'node',output:{file:'.sites-runtime/worker.test.mjs',format:'esm'}});
const result=spawnSync(process.execPath,['--test','--test-isolation=none','.sites-runtime/worker.test.mjs'],{stdio:'inherit'});
process.exit(result.status??1);

import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/engine.test.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/engine-tests.mjs'});
const result=spawnSync(process.execPath,['--test','.sites-runtime/engine-tests.mjs'],{stdio:'inherit'});
process.exit(result.status??1);

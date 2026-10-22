// 为浏览器验收启动私有 Go 实例；仅清理本进程创建的临时目录，不拼接 shell 命令。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const rawPort=process.env.E2E_PORT??'8899';
if(!/^\d+$/.test(rawPort)||Number(rawPort)<1||Number(rawPort)>65535)throw new Error('E2E_PORT 必须是有效端口');
const ownedDir=mkdtempSync(join(tmpdir(),'boss-e2e-'));
const child=spawn(resolve(process.env.E2E_SERVER_BINARY ?? 'bin/boss-server'),['--host','127.0.0.1','--port',rawPort,'--db',join(ownedDir,'e2e.db'),'--static',resolve(process.env.E2E_STATIC_DIR ?? 'dist')],{
  env:{...process.env,ALLOW_DEMO_RESET:'1'},stdio:'inherit',
});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);rmSync(ownedDir,{recursive:true,force:true});process.exit(1);});
child.on('exit',(code,signal)=>{rmSync(ownedDir,{recursive:true,force:true});process.exit(signal?0:code??1);});

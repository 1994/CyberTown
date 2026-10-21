// 验证当前 TypeScript 前端规则与 Go 测试用的契约样例仍然一致。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateTasks, scoreProject } from '../shared/rules.ts';
import type { ProjectAction, ProjectResult, ProjectTask, TeamSkills } from '../shared/rules.ts';
interface ContractCase {seed:number;durationMs:number;skills:TeamSkills;tasks:ProjectTask[];actions:ProjectAction[];result:ProjectResult}
const cases=JSON.parse(readFileSync(new URL('../contracts/rules-contract.json',import.meta.url),'utf8')) as ContractCase[];
for(const c of cases){
  const tasks=generateTasks(c.seed,c.durationMs);
  assert.deepEqual(tasks,c.tasks,`任务序列与 Go 契约不一致：seed=${c.seed}`);
  assert.deepEqual(scoreProject(tasks,c.actions,c.skills,c.durationMs,c.durationMs),c.result,`计分与 Go 契约不一致：seed=${c.seed}`);
}
console.log(`前端规则与 Go 契约一致：${cases.length} 组随机序列和计分样例通过。`);

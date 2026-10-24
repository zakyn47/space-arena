import { fileURLToPath } from 'node:url';
import { checkAssets } from './assetCheck';

const problems = await checkAssets(fileURLToPath(new URL('../assets', import.meta.url)));
for (const problem of problems) console.error(problem);
console.log(problems.length === 0 ? 'assets ok' : `${problems.length} asset problem(s)`);
process.exitCode = problems.length === 0 ? 0 : 1;

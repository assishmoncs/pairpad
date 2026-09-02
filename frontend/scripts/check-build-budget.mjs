import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const TOTAL_JS_BUDGET = Number(process.env.PERF_JS_TOTAL_BYTES || 2500000);
const MAX_JS_BUDGET = Number(process.env.PERF_JS_MAX_BYTES || 1000000);

async function walk(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const files = await walk(DIST);
const jsFiles = [];
for (const file of files) {
  if (!file.endsWith('.js') && !file.endsWith('.js.gz')) continue;
  const size = (await stat(file)).size;
  if (!file.endsWith('.gz')) jsFiles.push({ file, size });
}

const total = jsFiles.reduce((sum, item) => sum + item.size, 0);
const largest = jsFiles.reduce((max, item) => Math.max(max, item.size), 0);

console.log(JSON.stringify({
  jsFiles: jsFiles.length,
  totalJsBytes: total,
  largestJsBytes: largest,
  totalBudgetBytes: TOTAL_JS_BUDGET,
  largestBudgetBytes: MAX_JS_BUDGET,
}));

if (total > TOTAL_JS_BUDGET) {
  throw new Error(`Total JavaScript bundle budget exceeded: ${total} > ${TOTAL_JS_BUDGET}`);
}
if (largest > MAX_JS_BUDGET) {
  throw new Error(`Largest JavaScript asset budget exceeded: ${largest} > ${MAX_JS_BUDGET}`);
}

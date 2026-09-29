import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Parse without importing application modules or connecting to external services.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}
collect(resolve(root, 'src'));
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || `Syntax check failed: ${file}`);
    failures++;
  }
  const source = readFileSync(file, 'utf8');
  const imports = source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"]+)['"]/g);
  for (const [, specifier] of imports) {
    if (!existsSync(resolve(dirname(file), specifier))) {
      console.error(`Missing relative import: ${file}: ${specifier}`);
      failures++;
    }
  }
}
if (failures) process.exitCode = 1;
else console.log(`Checked syntax and relative imports for ${files.length} source files; no application code executed.`);

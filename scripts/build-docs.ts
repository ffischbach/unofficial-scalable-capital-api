import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let spec: ReturnType<typeof parseYaml>;
try {
  spec = parseYaml(readFileSync(join(root, 'openapi.yaml'), 'utf-8'));
} catch (err) {
  console.error('Failed to read or parse openapi.yaml:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const specJson = JSON.stringify(spec).replace(/<\/script>/gi, '<\\/script>');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${spec.info.title}</title>
  </head>
  <body>
    <script id="api-reference" type="application/json">${specJson}</script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.49.8"></script>
  </body>
</html>`;

mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'index.html'), html, 'utf-8');
console.log('docs/index.html generated');

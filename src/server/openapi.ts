import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { apiReference } from '@scalar/express-api-reference';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '../..', 'openapi.yaml');

export const spec = parseYaml(readFileSync(specPath, 'utf-8')) as Record<string, unknown>;

export const scalarMiddleware = apiReference({
  content: spec,
  theme: 'default',
});

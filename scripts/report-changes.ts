/**
 * Reads api-changes.json and either files GitHub issues automatically or
 * prints ready-to-paste issue content to stdout.
 *
 * Usage:
 *   npm run report-changes          # file via gh CLI (automatic)
 *   npm run report-changes:print    # print to stdout (copy-paste)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../');
const CHANGES_FILE = path.join(PROJECT_ROOT, 'api-changes.json');
const GITHUB_REPO = 'ffischbach/unofficial-scalabale-capital-api';
const NEW_ISSUE_URL = `https://github.com/${GITHUB_REPO}/issues/new`;

const { values } = parseArgs({ options: { print: { type: 'boolean', default: false } } });
const printMode = values.print as boolean;

// Keep in sync with the ChangeEntry interface in src/scalable/apiMonitor.ts
interface ChangeEntry {
  timestamp: string;
  operation: string;
  path: string;
  kind: 'added' | 'removed' | 'type-changed';
  from?: string;
  to?: string;
  issueUrl?: string;
}

function buildIssue(entry: ChangeEntry, print: boolean): { title: string; body: string } {
  const tag = entry.kind === 'added' ? '[API: field added]' : '[API: breaking change]';
  const title = `${tag} '${entry.operation}' — ${entry.path}`;
  const typeDetail = entry.from ? ` (\`${entry.from}\` → \`${entry.to}\`)` : '';
  const howToFix =
    entry.kind === 'removed'
      ? `The field \`${entry.path}\` was removed from \`${entry.operation}\`. Update the matching Zod schema in \`src/scalable/\` and re-baseline \`api-snapshot.json\`.`
      : entry.kind === 'type-changed'
        ? `The field \`${entry.path}\` changed type${typeDetail} in \`${entry.operation}\`. Update the matching Zod schema and re-baseline \`api-snapshot.json\`.`
        : `A new field \`${entry.path}\` appeared in \`${entry.operation}\`. Consider adding it to the Zod schema and re-baseline \`api-snapshot.json\`.`;

  const footer = print
    ? '*Reported manually — see `api-changes.json` for full context.*'
    : '*Filed via `npm run report-changes` — see `api-changes.json` for full context.*';

  const body = [
    '## Detected API change',
    '',
    '| | |',
    '|---|---|',
    `| **Operation** | \`${entry.operation}\` |`,
    `| **Path** | \`${entry.path}\` |`,
    `| **Change** | \`${entry.kind}\`${typeDetail} |`,
    `| **Detected** | ${entry.timestamp} |`,
    '',
    '## How to fix',
    '',
    howToFix,
    '',
    '---',
    footer,
  ].join('\n');

  return { title, body };
}

// --- Load changes ---

let changes: ChangeEntry[];
try {
  const raw = await fs.readFile(CHANGES_FILE, 'utf-8');
  changes = JSON.parse(raw) as ChangeEntry[];
} catch (err: unknown) {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    console.log('No api-changes.json found — nothing to report.');
    process.exit(0);
  }
  throw err;
}

const pending = changes.filter((e) => !e.issueUrl);

if (pending.length === 0) {
  console.log('All changes already have GitHub issues. Nothing to file.');
  process.exit(0);
}

// --- Print mode: output ready-to-paste issue content ---

if (printMode) {
  const divider = '─'.repeat(60);
  console.log(`${pending.length} pending change(s). Copy each issue below into:\n${NEW_ISSUE_URL}\n`);
  for (let i = 0; i < pending.length; i++) {
    const { title, body } = buildIssue(pending[i], true);
    console.log(divider);
    console.log(`Issue ${i + 1} of ${pending.length}`);
    console.log(divider);
    console.log(`TITLE:\n${title}\n`);
    console.log(`BODY:\n${body}`);
    console.log('');
  }
  console.log(divider);
  process.exit(0);
}

// --- Automatic mode: file via gh CLI ---

console.log(`Filing ${pending.length} issue(s) via gh...\n`);

for (const entry of pending) {
  const { title, body } = buildIssue(entry, false);
  try {
    const { stdout } = await execFileAsync('gh', ['issue', 'create', '--repo', GITHUB_REPO, '--title', title, '--body', body]);
    entry.issueUrl = stdout.trim();
    console.log(`  ✓ ${entry.issueUrl}`);
    console.log(`    ${entry.kind} — ${entry.operation} @ ${entry.path}`);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('gh CLI not found. Install from https://cli.github.com/ and run `gh auth login`.');
      console.error(`Use 'npm run report-changes:print' to get copy-pasteable issue content instead.`);
      process.exit(1);
    }
    console.error(`  ✗ Failed for '${entry.operation}' @ '${entry.path}':`, (err as Error).message);
  }
}

// Atomic write — consistent with apiMonitor.ts
const tmp = `${CHANGES_FILE}.${randomUUID()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(changes, null, 2));
await fs.rename(tmp, CHANGES_FILE);
console.log('\napi-changes.json updated with issue URLs.');

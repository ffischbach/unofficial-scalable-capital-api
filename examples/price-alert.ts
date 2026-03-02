#!/usr/bin/env tsx
/**
 * price-alert.ts — send a desktop notification when a quote crosses a threshold
 *
 * Usage:
 *   tsx examples/price-alert.ts --isin IE00B4L5Y983 --above 100
 *   tsx examples/price-alert.ts --isin IE00B4L5Y983 --below 90 --token my-secret
 *
 * Supports macOS (osascript), Linux (notify-send), and Windows (PowerShell).
 */

import { parseArgs } from 'node:util';
import { exec } from 'node:child_process';

const { values } = parseArgs({
  options: {
    isin:  { type: 'string' },
    above: { type: 'string' },
    below: { type: 'string' },
    token: { type: 'string' },
    port:  { type: 'string', default: '3141' },
  },
});

if (!values.isin) {
  console.error('Usage: tsx examples/price-alert.ts --isin <ISIN> [--above <price>] [--below <price>] [--token <token>]');
  process.exit(1);
}

if (!values.above && !values.below) {
  console.error('Provide at least one of --above or --below.');
  process.exit(1);
}

const BASE = `http://127.0.0.1:${values.port}`;
const above = values.above != null ? parseFloat(values.above) : null;
const below = values.below != null ? parseFloat(values.below) : null;
const url = `${BASE}/quotes/stream?isins=${values.isin}`;

const headers: Record<string, string> = {};
if (values.token) headers['X-Gateway-Token'] = values.token;

const conditions = [
  above != null && `above ${above}`,
  below != null && `below ${below}`,
].filter(Boolean).join(' · ');

console.log(`Watching ${values.isin} · alert ${conditions}`);
console.log('Connecting to SSE stream... (Ctrl+C to stop)\n');

const res = await fetch(url, { headers });
if (!res.ok || !res.body) {
  console.error(`Failed to connect: HTTP ${res.status}`);
  process.exit(1);
}

const decoder = new TextDecoder();
let buffer = '';

for await (const chunk of res.body) {
  buffer += decoder.decode(chunk as Uint8Array, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    try {
      const tick = JSON.parse(line.slice(6));
      const mid: number = tick.midPrice;
      const ts = new Date(tick.timestampUtc?.time ?? Date.now()).toISOString();
      console.log(`[${ts}] ${tick.isin}  mid=${mid}  bid=${tick.bidPrice}  ask=${tick.askPrice}`);

      if (above != null && mid > above) notify(tick.isin, `above ${above}`, mid);
      if (below != null && mid < below) notify(tick.isin, `below ${below}`, mid);
    } catch {
      // ignore malformed lines
    }
  }
}

function notify(isin: string, condition: string, price: number): void {
  const title = 'Portfolio Alert';
  const msg = `${isin} is ${condition} (current: ${price})`;
  console.log(`\n*** ALERT: ${msg} ***\n`);
  switch (process.platform) {
    case 'darwin':
      exec(`osascript -e 'display notification "${msg}" with title "${title}"'`);
      break;
      
    case 'linux':
      exec(`notify-send "${title}" "${msg}"`);
      break;
     
    case 'win32':
      exec(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${msg}','${title}')"`)
      break;
  }
}
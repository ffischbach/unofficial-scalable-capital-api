#!/usr/bin/env tsx
/**
 * export-transactions-csv.ts — export your full transaction history to a CSV file
 *
 * Usage:
 *   tsx examples/export-transactions-csv.ts
 *   tsx examples/export-transactions-csv.ts --out my-trades.csv --token secret
 */

import { parseArgs } from 'node:util';
import { createWriteStream } from 'node:fs';

const { values } = parseArgs({
  options: {
    out:   { type: 'string', default: 'transactions.csv' },
    token: { type: 'string' },
    port:  { type: 'string', default: '3141' },
  },
});

const BASE = `http://127.0.0.1:${values.port}`;

const headers: Record<string, string> = {};
if (values.token) headers['X-Gateway-Token'] = values.token;

interface Transaction {
  id: string;
  currency: string;
  type: string;
  status: string;
  isCancellation: boolean;
  lastEventDateTime: string;
  description: string;
  amount?: number;
  isin?: string;
  relatedIsin?: string;
  side?: string;
  quantity?: number;
  cashTransactionType?: string;
  securityTransactionType?: string;
  nonTradeSecurityTransactionType?: string;
}

const CSV_COLUMNS = [
  'id', 'type', 'status', 'isCancellation', 'lastEventDateTime',
  'description', 'currency', 'amount', 'isin', 'side', 'quantity',
  'cashTransactionType', 'securityTransactionType',
];

function toRow(tx: Transaction): string {
  const isin = tx.isin ?? tx.relatedIsin ?? '';
  const secType = tx.securityTransactionType ?? tx.nonTradeSecurityTransactionType ?? '';
  const fields: (string | number | boolean | undefined)[] = [
    tx.id, tx.type, tx.status, tx.isCancellation, tx.lastEventDateTime,
    tx.description, tx.currency, tx.amount ?? '',
    isin, tx.side ?? '', tx.quantity ?? '',
    tx.cashTransactionType ?? '', secType,
  ];
  return fields.map(f => `"${String(f ?? '').replace(/"/g, '""')}"`).join(',');
}

const outPath = values.out!;
const out = createWriteStream(outPath);
out.write(CSV_COLUMNS.join(',') + '\n');

let cursor: string | undefined;
let total = 0;
let page = 1;

console.log(`Exporting transactions to ${outPath}…`);

do {
  const params = new URLSearchParams({ pageSize: '500' });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${BASE}/transactions?${params}`, { headers });
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = (await res.json()) as any;
  const pageData = data?.account?.brokerPortfolio?.moreTransactions;
  const transactions: Transaction[] = pageData?.transactions ?? [];
  const next: string | null = pageData?.cursor ?? null;

  for (const tx of transactions) {
    out.write(toRow(tx) + '\n');
    total++;
  }

  console.log(`  Page ${page++}: ${transactions.length} rows (total so far: ${total})`);
  cursor = next ?? undefined;
} while (cursor);

await new Promise<void>((resolve) => out.end(resolve));
console.log(`Done. ${total} transactions written to ${outPath}.`);
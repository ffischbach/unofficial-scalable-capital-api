import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SNAPSHOT_FILE = path.join(PROJECT_ROOT, 'api-snapshot.json');
const CHANGES_FILE = path.join(PROJECT_ROOT, 'api-changes.json');

// --- Feature toggle ---

let monitorEnabled = false;

export function setMonitorEnabled(enabled: boolean): void {
  monitorEnabled = enabled;
}

// --- Shape types ---

export type PrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'unknown';
export type ShapeNode = PrimitiveType | { [key: string]: ShapeNode };
type SnapshotMap = Record<string, ShapeNode>;

// --- Change log ---

// Keep in sync with the ChangeEntry interface in scripts/report-changes.ts
export interface ChangeEntry {
  timestamp: string;
  operation: string;
  path: string;
  kind: 'added' | 'removed' | 'type-changed';
  from?: string;
  to?: string;
  issueUrl?: string;
}

let changeLog: ChangeEntry[] = [];
let changeLogLoaded = false;
/** Dedup key: operation + path + kind — one entry per unique structural issue. */
const seenChanges = new Set<string>();

async function loadChangeLog(): Promise<void> {
  if (changeLogLoaded) return;
  changeLogLoaded = true;
  try {
    const raw = await fs.readFile(CHANGES_FILE, 'utf-8');
    changeLog = JSON.parse(raw) as ChangeEntry[];
    for (const e of changeLog) {
      seenChanges.add(`${e.operation}:${e.path}:${e.kind}`);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[API MONITOR] Failed to load api-changes.json:', err);
    }
  }
}

async function persistChangeLog(): Promise<void> {
  const tmpFile = `${CHANGES_FILE}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(changeLog, null, 2));
    await fs.rename(tmpFile, CHANGES_FILE);
  } catch (err) {
    console.warn('[API MONITOR] Failed to persist api-changes.json:', err);
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function recordChange(entry: ChangeEntry): void {
  const key = `${entry.operation}:${entry.path}:${entry.kind}`;
  if (seenChanges.has(key)) return;
  seenChanges.add(key);
  changeLog.push(entry);
  void persistChangeLog();
}

// --- Shape extraction ---

export function extractShape(value: unknown): ShapeNode {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) {
    const firstNonNull = value.find((el) => el !== null);
    if (firstNonNull !== undefined) {
      return { '[item]': extractShape(firstNonNull) };
    }
    return 'array';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const shape: { [key: string]: ShapeNode } = {};
    for (const key of Object.keys(obj)) {
      shape[key] = extractShape(obj[key]);
    }
    return shape;
  }
  return 'unknown';
}

// --- Shape diffing ---

function shapeLabel(s: ShapeNode): string {
  return typeof s === 'string' ? s : 'object';
}

function diffShapes(
  opName: string,
  oldShape: ShapeNode,
  newShape: ShapeNode,
  pathStr: string,
): void {
  if (typeof oldShape === 'string' && typeof newShape === 'string' && oldShape === newShape) return;

  if (oldShape === 'array' && typeof newShape === 'object' && '[item]' in newShape) return;

  if (typeof oldShape === 'string' && typeof newShape === 'string' && oldShape !== newShape) {
    const msg = `[API MONITOR] '${opName}': type changed at '${pathStr}' (${oldShape} → ${newShape})`;
    console.warn(msg);
    recordChange({
      timestamp: new Date().toISOString(),
      operation: opName,
      path: pathStr,
      kind: 'type-changed',
      from: oldShape,
      to: newShape,
    });
    return;
  }
  if (typeof oldShape !== typeof newShape) {
    const from = shapeLabel(oldShape);
    const to = shapeLabel(newShape);
    const msg = `[API MONITOR] '${opName}': type changed at '${pathStr}' (${from} → ${to})`;
    console.warn(msg);
    recordChange({
      timestamp: new Date().toISOString(),
      operation: opName,
      path: pathStr,
      kind: 'type-changed',
      from,
      to,
    });
    return;
  }

  if (typeof oldShape === 'object' && typeof newShape === 'object') {
    const oldKeys = new Set(Object.keys(oldShape));
    const newKeys = new Set(Object.keys(newShape));
    const prefix = pathStr ? `${pathStr}.` : '';
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        console.warn(`[API MONITOR] '${opName}': field removed at '${prefix}${key}'`);
        recordChange({
          timestamp: new Date().toISOString(),
          operation: opName,
          path: `${prefix}${key}`,
          kind: 'removed',
        });
      }
    }
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        console.log(`[API MONITOR] '${opName}': field added at '${prefix}${key}'`);
        recordChange({
          timestamp: new Date().toISOString(),
          operation: opName,
          path: `${prefix}${key}`,
          kind: 'added',
        });
      }
    }
    for (const key of oldKeys) {
      if (newKeys.has(key)) {
        diffShapes(opName, oldShape[key], newShape[key], `${prefix}${key}`);
      }
    }
  }
}

// --- Snapshot I/O ---

let snapshotCache: SnapshotMap | null = null;

async function loadSnapshot(): Promise<SnapshotMap> {
  if (snapshotCache !== null) return snapshotCache;
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, 'utf-8');
    snapshotCache = JSON.parse(raw) as SnapshotMap;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      snapshotCache = {};
    } else {
      throw err;
    }
  }
  return snapshotCache;
}

async function persistSnapshot(map: SnapshotMap): Promise<void> {
  const tmpFile = `${SNAPSHOT_FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(map, null, 2));
  await fs.rename(tmpFile, SNAPSHOT_FILE);
  snapshotCache = map;
}

// --- Public API ---

export async function checkResponseShape(operationName: string, data: unknown): Promise<void> {
  if (!monitorEnabled) return;
  try {
    await loadChangeLog();
    const snapshot = await loadSnapshot();
    const newShape = extractShape(data);
    if (!(operationName in snapshot)) {
      snapshot[operationName] = newShape;
      await persistSnapshot(snapshot);
      console.log(`[API MONITOR] Snapshotted new operation: '${operationName}'`);
      return;
    }
    diffShapes(operationName, snapshot[operationName], newShape, '');
  } catch (err) {
    console.warn('[API MONITOR] Internal error:', err);
  }
}

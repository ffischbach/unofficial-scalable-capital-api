import { describe, it, expect } from 'vitest';
import { extractShape } from './apiMonitor.ts';

describe('extractShape', () => {
  it('returns "null" for null', () => {
    expect(extractShape(null)).toBe('null');
  });

  it('returns "number" for numbers', () => {
    expect(extractShape(42)).toBe('number');
  });

  it('returns "string" for strings', () => {
    expect(extractShape('hello')).toBe('string');
  });

  it('returns "boolean" for booleans', () => {
    expect(extractShape(true)).toBe('boolean');
    expect(extractShape(false)).toBe('boolean');
  });

  it('returns "unknown" for undefined', () => {
    expect(extractShape(undefined)).toBe('unknown');
  });

  it('returns { "[item]": "number" } for a number array', () => {
    expect(extractShape([1, 2, 3])).toEqual({ '[item]': 'number' });
  });

  it('returns "array" when all items are null', () => {
    expect(extractShape([null, null])).toBe('array');
  });

  it('skips leading nulls and uses first non-null item', () => {
    expect(extractShape([null, 1])).toEqual({ '[item]': 'number' });
  });

  it('returns shape for a flat object', () => {
    expect(extractShape({ a: 1, b: 'x' })).toEqual({ a: 'number', b: 'string' });
  });

  it('handles nested objects', () => {
    expect(extractShape({ nested: { deep: true } })).toEqual({ nested: { deep: 'boolean' } });
  });

  it('handles object with array field', () => {
    expect(extractShape({ arr: [1] })).toEqual({ arr: { '[item]': 'number' } });
  });

  it('returns empty object for empty object', () => {
    expect(extractShape({})).toEqual({});
  });
});

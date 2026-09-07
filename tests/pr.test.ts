import { describe, expect, test } from 'bun:test';

import {
  hopIdentity,
  hopSeam,
  mergePrHops,
  type PrTraceHop,
} from '../plugins/architecture-map/skills/architecture-map/runtime/pr';
import type { MapDocument } from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { loadFixture } from './helpers';

const pr = (await loadFixture('pr-create-order-outbox.map.json')) as MapDocument;

function trace(hop: Partial<PrTraceHop> & Pick<PrTraceHop, 'from' | 'to'>): PrTraceHop {
  return {
    type: 'HTTP',
    label: 'x',
    source: 'a.ts',
    work: 'does a thing',
    ...hop,
  };
}

describe('mergePrHops', () => {
  test('identical traces are all unchanged', () => {
    const a = [trace({ from: 'a', to: 'b' }), trace({ from: 'b', to: 'c' })];
    const merged = mergePrHops(a, a.map((h) => ({ ...h })));
    expect(merged.map((h) => h.status)).toEqual(['unchanged', 'unchanged']);
    expect(merged.map((h) => h.n)).toEqual([1, 2]);
    expect(merged.every((h) => h.beforeWork === undefined)).toBe(true);
  });

  test('new hop on head is added; hop only on base is removed and appended last', () => {
    const before = [trace({ from: 'a', to: 'b' }), trace({ from: 'b', to: 'z', source: 'old.ts' })];
    const after = [trace({ from: 'a', to: 'b' }), trace({ from: 'b', to: 'c', source: 'new.ts' })];
    const merged = mergePrHops(before, after);
    expect(merged.map((h) => [h.status, h.from, h.to])).toEqual([
      ['unchanged', 'a', 'b'],
      ['added', 'b', 'c'],
      ['removed', 'b', 'z'],
    ]);
    expect(merged[2].n).toBe(3);
  });

  test('same seam with different text is changed and keeps the base work as beforeWork', () => {
    const before = [trace({ from: 'a', to: 'b', work: 'old behaviour' })];
    const after = [trace({ from: 'a', to: 'b', work: 'new behaviour', source: 'moved.ts' })];
    const [hop] = mergePrHops(before, after);
    expect(hop.status).toBe('changed');
    expect(hop.work).toBe('new behaviour');
    expect(hop.beforeWork).toBe('old behaviour');
    expect(hop.source).toBe('moved.ts');
  });

  test('a changed label alone marks the hop changed', () => {
    const before = [trace({ from: 'a', to: 'b', label: 'POST /v1/orders' })];
    const after = [trace({ from: 'a', to: 'b', label: 'POST /v2/orders' })];
    expect(mergePrHops(before, after)[0].status).toBe('changed');
  });

  test('exact identity wins over seam when both candidates exist', () => {
    const before = [
      trace({ from: 'a', to: 'b', type: 'HTTP', source: 'h.ts', work: 'http' }),
      trace({ from: 'a', to: 'b', type: 'message bus', source: 'q.ts', work: 'queue' }),
    ];
    const after = [trace({ from: 'a', to: 'b', type: 'message bus', source: 'q.ts', work: 'queue' })];
    const merged = mergePrHops(before, after);
    expect(merged.map((h) => [h.status, h.type])).toEqual([
      ['unchanged', 'message bus'],
      ['removed', 'HTTP'],
    ]);
  });

  test('identity and seam helpers', () => {
    const h = trace({ from: 'a', to: 'b', type: 'database', source: 's.ts' });
    expect(hopIdentity(h)).toBe(['a', 'b', 'database', 's.ts'].join('\0'));
    expect(hopSeam(h)).toBe('a\0b');
  });

  test('reproduces the outbox golden from its own before/after traces', () => {
    const strip = (h: MapDocument['hops'][number]): PrTraceHop => {
      const { n: _n, status: _s, beforeWork: _b, ...rest } = h;
      return rest;
    };
    const after = pr.hops.filter((h) => h.status !== 'removed').map(strip);
    const before = pr.hops
      .filter((h) => h.status !== 'added')
      .map((h) => (h.status === 'changed' ? { ...strip(h), work: h.beforeWork! } : strip(h)));
    const merged = mergePrHops(before, after);
    expect(merged.map((h) => h.status)).toEqual(pr.hops.map((h) => h.status));
    expect(merged.find((h) => h.status === 'changed')!.beforeWork).toBe(
      pr.hops.find((h) => h.status === 'changed')!.beforeWork
    );
  });
});

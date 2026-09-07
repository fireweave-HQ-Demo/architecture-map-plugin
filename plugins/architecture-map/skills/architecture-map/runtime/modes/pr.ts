/**
 * Diff two traced hop lists (before = base ref, after = PR head).
 *
 * Agents still open files at each ref and write the two traces; this only
 * classifies the overlay so nobody hand-labels unchanged/added/removed/changed.
 */

import type { MapHop, PrStatus } from '../schema';

/** A hop as traced at one ref: no `n`, no `status`, no `beforeWork`. */
export type PrTraceHop = Omit<MapHop, 'n' | 'status' | 'beforeWork'>;

export function hopIdentity(
  hop: Pick<MapHop, 'from' | 'to' | 'type' | 'source'>
): string {
  return [hop.from, hop.to, hop.type, hop.source].join('\0');
}

export function hopSeam(hop: Pick<MapHop, 'from' | 'to'>): string {
  return hop.from + '\0' + hop.to;
}

function sameText(a: PrTraceHop, b: PrTraceHop): boolean {
  return (
    a.label === b.label &&
    a.work === b.work &&
    a.in === b.in &&
    a.out === b.out &&
    a.fail === b.fail &&
    a.because === b.because &&
    a.not === b.not
  );
}

function findBeforeIndex(
  afterHop: PrTraceHop,
  before: PrTraceHop[],
  used: Set<number>
): number {
  const wantId = hopIdentity(afterHop);
  const exact = before.findIndex(
    (b, i) => !used.has(i) && hopIdentity(b) === wantId
  );
  if (exact >= 0) return exact;
  const wantSeam = hopSeam(afterHop);
  return before.findIndex((b, i) => !used.has(i) && hopSeam(b) === wantSeam);
}

/**
 * Merge two traces into one PR hop list.
 *
 * - same from/to/type/source and same text  → unchanged
 * - same from/to (seam) but anything differs → changed, `beforeWork` = base
 * - only on head                             → added
 * - only on base (appended after the path)   → removed
 */
export function mergePrHops(
  before: PrTraceHop[],
  after: PrTraceHop[]
): MapHop[] {
  const used = new Set<number>();
  const out: MapHop[] = [];

  after.forEach((a) => {
    const bi = findBeforeIndex(a, before, used);
    if (bi === -1) {
      out.push({ ...a, n: out.length + 1, status: 'added' satisfies PrStatus });
      return;
    }
    used.add(bi);
    const b = before[bi];
    const unchanged = hopIdentity(a) === hopIdentity(b) && sameText(a, b);
    const row: MapHop = {
      ...a,
      n: out.length + 1,
      status: unchanged ? 'unchanged' : 'changed',
    };
    if (!unchanged) row.beforeWork = b.work;
    out.push(row);
  });

  before.forEach((b, i) => {
    if (used.has(i)) return;
    out.push({ ...b, n: out.length + 1, status: 'removed' satisfies PrStatus });
  });

  return out;
}

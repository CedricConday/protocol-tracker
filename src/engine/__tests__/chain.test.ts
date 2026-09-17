/**
 * The chain. Entry is relative — "30 minutes after the magnesium" — and storage
 * is absolute, so this arithmetic sits between the patient and
 * `dose_logs.scheduled_time`. Get it wrong and doses land at the wrong hour
 * without anyone having typed a wrong number.
 *
 * Pure module, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import { offsetsToGaps, gapsToOffsets, previousInChain, reChainFrom } from '../chain';

const rule = (id: string, name: string, offset_minutes: number) => ({ id, name, offset_minutes });

describe('offsetsToGaps', () => {
  it('sorts by offset and measures each hop from the one before', () => {
    const links = offsetsToGaps([
      rule('c', 'Omega-3', 240),
      rule('a', 'Vitamin D3', 0),
      rule('b', 'K2', 30),
    ]);
    expect(links.map((l) => [l.name, l.gapFromPrev, l.prevName])).toEqual([
      ['Vitamin D3', 0, null],
      ['K2', 30, 'Vitamin D3'],
      ['Omega-3', 210, 'K2'],
    ]);
  });

  it('keeps a stable order for two supplements taken together', () => {
    const together = [rule('k2', 'K2', 0), rule('d3', 'D3', 0)];
    expect(offsetsToGaps(together).map((l) => l.id)).toEqual(['d3', 'k2']);
    expect(offsetsToGaps([...together].reverse()).map((l) => l.id)).toEqual(['d3', 'k2']);
  });

  it('reports a zero gap rather than pretending the second one is first', () => {
    const links = offsetsToGaps([rule('a', 'D3', 0), rule('b', 'K2', 0)]);
    expect(links[1].gapFromPrev).toBe(0);
    expect(links[1].prevName).toBe('D3');
  });

  it('is empty for an empty protocol', () => {
    expect(offsetsToGaps([])).toEqual([]);
  });
});

describe('gapsToOffsets', () => {
  it('runs the sum, which is the whole point of entering gaps', () => {
    expect(gapsToOffsets([0, 30, 240])).toEqual([0, 30, 270]);
  });

  it('never walks backwards past the start of the day', () => {
    expect(gapsToOffsets([0, -60, 30])).toEqual([0, 0, 30]);
  });

  it('stays monotonic across a 37-pill protocol', () => {
    const gaps = Array.from({ length: 37 }, (_, i) => (i === 0 ? 0 : 15));
    const offsets = gapsToOffsets(gaps);
    expect(offsets[36]).toBe(36 * 15);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
  });
});

describe('previousInChain', () => {
  const rules = [rule('a', 'D3', 0), rule('b', 'Magnesium', 240), rule('c', 'Zinc', 600)];

  it('finds the supplement a new gap is measured against', () => {
    expect(previousInChain(rules, 300)?.name).toBe('Magnesium');
  });

  it('counts one at the same minute as preceding it', () => {
    expect(previousInChain(rules, 240)?.name).toBe('Magnesium');
  });

  it('returns null at the head, which is what makes the first question different', () => {
    expect(previousInChain([], 0)).toBeNull();
    expect(previousInChain([rule('b', 'Magnesium', 240)], 0)).toBeNull();
  });
});

describe('reChainFrom', () => {
  const rules = [
    rule('a', 'D3', 0),
    rule('b', 'K2', 30),
    rule('c', 'Magnesium', 270),
    rule('d', 'Zinc', 300),
  ];

  it('carries an edited gap through everything after it', () => {
    const next = reChainFrom(rules, 'c', 300);
    expect(next.map((r) => r.offset_minutes)).toEqual([0, 30, 330, 360]);
  });

  it('pulls the tail earlier when the gap shrinks', () => {
    const next = reChainFrom(rules, 'c', 60);
    expect(next.map((r) => r.offset_minutes)).toEqual([0, 30, 90, 120]);
  });

  it('clamps at the start of the day instead of going negative', () => {
    const next = reChainFrom(rules, 'b', -500);
    expect(next.map((r) => r.offset_minutes)).toEqual([0, 0, 240, 270]);
  });

  it('leaves the chain alone when the id is not in it', () => {
    expect(reChainFrom(rules, 'nope', 999)).toEqual(rules);
  });

  it('does not invent or drop fields', () => {
    const withExtra = [{ ...rule('a', 'D3', 0), tolerance_window: 30 }];
    expect(reChainFrom(withExtra, 'a', 0)[0]).toEqual({ id: 'a', name: 'D3', offset_minutes: 0, tolerance_window: 30 });
  });

  it('is a no-op when the gap is restated as what it already was', () => {
    expect(reChainFrom(rules, 'c', 240).map((r) => r.offset_minutes)).toEqual([0, 30, 270, 300]);
  });
});

describe('deleting a supplement outside the wizard', () => {
  it('leaves the others where they are and simply widens the gap', () => {
    const rules = [rule('a', 'D3', 0), rule('b', 'K2', 30), rule('c', 'Magnesium', 270)];
    const afterDelete = rules.filter((r) => r.id !== 'b');
    const links = offsetsToGaps(afterDelete);
    expect(links.map((l) => l.offset_minutes)).toEqual([0, 270]);
    expect(links[1].gapFromPrev).toBe(270);
    expect(links[1].prevName).toBe('D3');
  });
});

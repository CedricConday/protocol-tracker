/**
 * The supplement chain: absolute offsets in, gaps out, and back again.
 *
 * Every timing value in this app is stored as `schedule_rules.offset_minutes`,
 * an absolute count of minutes after T0, and that does not change here. What
 * changed on 2026-09-17 is how a patient *enters* it. Typing "240" against a
 * moment four hours earlier is arithmetic nobody does correctly at pill #37;
 * what they know is "this one goes 30 minutes after the magnesium". So the
 * wizard collects gaps and this module flattens them.
 *
 * Deliberately storing absolute, not relative: `scheduler.startDay` resolves
 * `t0 + offset_minutes` into `dose_logs.scheduled_time`, and so do
 * `createDoseLogForNewRule`, `getLatestStartTime` and `dosesPastBedtime`. A
 * stored chain would make row N depend on row N-1, and one delete would move
 * every dose after it — and its notification — without the patient touching
 * them.
 *
 * Order comes from the offsets themselves, not from `display_order`, which
 * `addSupplement` has never written and is 0 on every row.
 *
 * No imports on purpose: this is arithmetic, and it is the part worth testing
 * under a node-only vitest.
 */

export type ChainRule = {
  id: string;
  name: string;
  offset_minutes: number;
};

export type ChainLink<T extends ChainRule = ChainRule> = T & {
  /** Minutes after the previous link. Equals `offset_minutes` for the first. */
  gapFromPrev: number;
  /** The name this link's gap is measured against, or null for the first. */
  prevName: string | null;
};

/**
 * Sorts by offset and annotates each rule with its gap from the one before.
 *
 * Ties break on id so two supplements at the same offset keep a stable order
 * between renders — taking them together is ordinary (D3 and K2 do), and a list
 * that reshuffles itself on every reload reads as a bug.
 */
export function offsetsToGaps<T extends ChainRule>(rules: readonly T[]): ChainLink<T>[] {
  const sorted = [...rules].sort(
    (a, b) => a.offset_minutes - b.offset_minutes || a.id.localeCompare(b.id),
  );
  let prev = 0;
  let prevName: string | null = null;
  return sorted.map((rule) => {
    const link: ChainLink<T> = {
      ...rule,
      gapFromPrev: rule.offset_minutes - prev,
      prevName,
    };
    prev = rule.offset_minutes;
    prevName = rule.name;
    return link;
  });
}

/** Running sum: the wizard's gaps become the absolute offsets that get stored. */
export function gapsToOffsets(gaps: readonly number[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const gap of gaps) {
    running += Math.max(0, Math.round(gap));
    offsets.push(running);
  }
  return offsets;
}

/**
 * The rule a new entry is being measured against: the latest one at or before
 * `offset`. Null when nothing precedes it, which is what makes the wizard's
 * first question "how long after you start your day?" instead.
 */
export function previousInChain<T extends ChainRule>(
  rules: readonly T[],
  offset: number,
): T | null {
  let best: T | null = null;
  for (const rule of rules) {
    if (rule.offset_minutes > offset) continue;
    if (!best || rule.offset_minutes > best.offset_minutes) best = rule;
  }
  return best;
}

/**
 * Restate one link's gap and carry the change through the rest of the chain.
 *
 * This is the review step's edit, and the shift is intended there: the patient
 * is looking at the whole chain and saying "no, that one comes an hour later" —
 * the pills after it come an hour later too, because they were entered as gaps
 * from it. Nothing else in the app re-chains; deleting a supplement from the
 * editor leaves the others exactly where they are and simply widens the gap
 * shown against the previous one.
 *
 * Clamped at 0 because T0 is the start of the protocol day, not a midpoint —
 * there is no "before you started".
 */
export function reChainFrom<T extends ChainRule>(
  rules: readonly T[],
  editedId: string,
  newGap: number,
): T[] {
  const links = offsetsToGaps(rules);
  const index = links.findIndex((l) => l.id === editedId);
  if (index === -1) return [...rules];

  const gaps = links.map((l, i) => (i === index ? Math.max(0, Math.round(newGap)) : l.gapFromPrev));
  const offsets = gapsToOffsets(gaps);
  return links.map((link, i) => {
    const { gapFromPrev: _gap, prevName: _prev, ...rule } = link;
    return { ...(rule as unknown as T), offset_minutes: offsets[i] };
  });
}

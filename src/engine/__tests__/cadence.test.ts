import { describe, expect, it } from 'vitest';
import { ruleFiresOn, describeCadence, DEFAULT_CADENCE, type Cadence } from '../cadence';

const rule = (over: Partial<Cadence>): Cadence => ({ ...DEFAULT_CADENCE, ...over });

// 2026-09-14 is a Monday; getDay() 1. 2026-09-13 is Sunday, 0.
const MON = '2026-09-14';
const SUN = '2026-09-13';

describe('daily', () => {
  it('fires every day', () => {
    expect(ruleFiresOn(rule({}), MON)).toBe(true);
    expect(ruleFiresOn(rule({}), SUN)).toBe(true);
  });
});

describe('as-needed', () => {
  it('is never owed', () => {
    expect(ruleFiresOn(rule({ frequency: 'as-needed' }), MON)).toBe(false);
  });
});

describe('specific-days', () => {
  const monWedFri = rule({ frequency: 'specific-days', days_of_week: '1,3,5' });

  it('fires on a selected day', () => {
    expect(ruleFiresOn(monWedFri, MON)).toBe(true);
  });

  it('stays quiet on an unselected day', () => {
    expect(ruleFiresOn(monWedFri, SUN)).toBe(false);
  });

  it('treats an empty selection as daily rather than never', () => {
    expect(ruleFiresOn(rule({ frequency: 'specific-days', days_of_week: '' }), SUN)).toBe(true);
  });
});

describe('day-of-month', () => {
  it('fires on the chosen day only', () => {
    const r = rule({ frequency: 'day-of-month', day_of_month: 14 });
    expect(ruleFiresOn(r, MON)).toBe(true);
    expect(ruleFiresOn(r, SUN)).toBe(false);
  });

  it('lands a 31st rule on the last day of a shorter month', () => {
    const r = rule({ frequency: 'day-of-month', day_of_month: 31 });
    expect(ruleFiresOn(r, '2026-09-30')).toBe(true); // September has 30
    expect(ruleFiresOn(r, '2026-09-29')).toBe(false);
    expect(ruleFiresOn(r, '2026-10-31')).toBe(true); // October has 31
    expect(ruleFiresOn(r, '2026-10-30')).toBe(false);
  });

  it('does not skip February for a 30th rule', () => {
    const r = rule({ frequency: 'day-of-month', day_of_month: 30 });
    expect(ruleFiresOn(r, '2026-02-28')).toBe(true);
  });
});

describe('cycle', () => {
  const fiveOnTwoOff = rule({
    frequency: 'cycle',
    cycle_on_days: 5,
    cycle_off_days: 2,
    cycle_start_date: '2026-09-14',
  });

  it('fires through the on-stretch and stops for the off-stretch', () => {
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    for (const d of days) expect(ruleFiresOn(fiveOnTwoOff, d)).toBe(true);
    expect(ruleFiresOn(fiveOnTwoOff, '2026-09-19')).toBe(false);
    expect(ruleFiresOn(fiveOnTwoOff, '2026-09-20')).toBe(false);
  });

  it('wraps into the next cycle', () => {
    expect(ruleFiresOn(fiveOnTwoOff, '2026-09-21')).toBe(true);
    expect(ruleFiresOn(fiveOnTwoOff, '2026-09-26')).toBe(false);
  });

  it('owes nothing before the cycle starts', () => {
    expect(ruleFiresOn(fiveOnTwoOff, '2026-09-13')).toBe(false);
  });

  it('falls back to firing when the cycle is half-configured', () => {
    expect(ruleFiresOn(rule({ frequency: 'cycle', cycle_on_days: 5 }), MON)).toBe(true);
  });
});

describe('bad data', () => {
  // A rule that silently stopped producing doses would be indistinguishable
  // from a patient who stopped taking it, and the history would carry that.
  it('fires rather than disappears on an unknown frequency', () => {
    expect(ruleFiresOn(rule({ frequency: 'weekly-ish' }), MON)).toBe(true);
  });

  it('fires on a malformed date', () => {
    expect(ruleFiresOn(rule({ frequency: 'specific-days', days_of_week: '1' }), 'tomorrow')).toBe(true);
  });
});

describe('describeCadence', () => {
  it('names the weekdays it fires on', () => {
    expect(describeCadence(rule({ frequency: 'specific-days', days_of_week: '1,3,5' }))).toBe('Mon · Wed · Fri');
  });

  it('reads a cycle as on/off', () => {
    const s = describeCadence(rule({ frequency: 'cycle', cycle_on_days: 5, cycle_off_days: 2 }));
    expect(s).toContain('5');
    expect(s).toContain('2');
  });
});

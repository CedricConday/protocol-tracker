import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { todayStr } from '../db/queries';

/**
 * The current local day key (`YYYY-MM-DD`), kept live while the app is open.
 *
 * `todayStr()` called during render answers correctly for that render and then
 * never again: nothing re-renders at midnight, so a screen left open across the
 * boundary kept showing — and writing to — yesterday. The tab stays mounted
 * (React Navigation keeps screens alive) and `useFocusEffect` only re-fires on
 * a focus change, so simply looking at the phone the next morning was enough to
 * log a dose, a note or a session onto the wrong day.
 *
 * Two triggers, because neither alone is enough:
 *
 * 1. A timer armed at the next local midnight. Handles the app being watched
 *    across the boundary. `setHours(24, 0, 0, 0)` rather than +24h so DST
 *    transitions land on the real local midnight, not 23:00 or 01:00.
 * 2. `AppState` going `active`. Background timers are throttled or suspended
 *    outright, so a phone asleep from 23:00 to 08:00 never fires (1) — the
 *    foreground check is what catches that case, which is also the common one.
 *
 * The subscriber set is module-level so every screen agrees on the day within
 * the same tick; the timer and the AppState listener exist only while something
 * is actually subscribed.
 */

type Listener = (day: string) => void;

const listeners = new Set<Listener>();
let current = todayStr();
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

export function msUntilNextMidnight(from: Date = new Date()): number {
  const next = new Date(from);
  next.setHours(24, 0, 0, 0);
  // A one-second cushion keeps the wake-up on the far side of the boundary; a
  // timer that fires a few milliseconds early reads the old day and would
  // otherwise re-arm for ~0ms and spin.
  return Math.max(1_000, next.getTime() - from.getTime() + 1_000);
}

/** Re-read the clock, notify if the day moved, and re-arm. */
function tick(): void {
  const now = todayStr();
  if (now !== current) {
    current = now;
    listeners.forEach((l) => l(current));
  }
  arm();
}

function arm(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, msUntilNextMidnight());
}

function start(): void {
  if (appStateSub) return;
  current = todayStr();
  arm();
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') tick();
  });
}

function stop(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
}

/** The day key as of now, without subscribing. For non-React callers. */
export function currentDay(): string {
  return current;
}

/**
 * Call `listener` whenever the local day changes. Returns an unsubscribe.
 * `useToday` is this plus a re-render; anything outside React uses it directly.
 */
export function subscribeDay(listener: Listener): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function useToday(): string {
  const [day, setDay] = useState(current);

  useEffect(() => {
    const unsubscribe = subscribeDay(setDay);
    // A component mounting after the roll would otherwise hold the value its
    // first render captured until the NEXT midnight.
    setDay(current);
    return unsubscribe;
  }, []);

  return day;
}

/** Test seam: drop the timer and listener without waiting for unmount. */
export function __resetDayClock(): void {
  listeners.clear();
  stop();
  current = todayStr();
}

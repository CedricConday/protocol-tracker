// [PowerSync spike] Typed watch query — demonstrates the reactive API shape.
// PowerSync's watch() re-runs whenever tracked tables change (no polling).
// This is the local-only path; sync with a backend would add connect/disconnect.
import type { QueryResult } from '@powersync/common';
import { powersyncDb } from './client';

export interface TodaysDoseRow {
  id: string;
  supplement_id: string;
  scheduled_time: number;
  status: string;
}

export function watchTodaysDoses(date: string): AsyncIterable<QueryResult> {
  return powersyncDb.watch(
    `SELECT id, supplement_id, scheduled_time, status
       FROM dose_logs
      WHERE date = ?`,
    [date],
  );
}

// Usage (in a React component or service):
//   for await (const result of watchTodaysDoses('2026-07-01')) {
//     const rows = result.rows!.toArray() as TodaysDoseRow[];
//     console.log('doses updated:', rows);
//   }

// [PowerSync spike] Schema mirroring the core tables from src/db/schema.ts.
// PowerSync's managed tables use a JSON-based sync model — these define the
// columns PowerSync tracks. Local-only flags avoid needing a backend.
import { column, Schema, Table } from '@powersync/common';

export const supplements = new Table(
  {
    name: column.text,
    form: column.text,
    category: column.text,
    notes: column.text,
  },
  { indexes: { supplements_name: ['name'] } },
);

export const scheduleRules = new Table(
  {
    supplement_id: column.text,
    anchor_type: column.text,
    offset_minutes: column.integer,
    tolerance_window: column.integer,
    with_food: column.integer,
    dose_amount: column.text,
    dose_unit: column.text,
    display_order: column.integer,
  },
  { indexes: { schedule_rules_supplement: ['supplement_id'] } },
);

export const doseLogs = new Table(
  {
    date: column.text,
    supplement_id: column.text,
    rule_id: column.integer,
    scheduled_time: column.integer,
    logged_time: column.integer,
    status: column.text,
    missed_alerted: column.integer,
  },
  { indexes: { dose_logs_date: ['date'], dose_logs_supplement_date: ['supplement_id', 'date'] } },
);

export const dailyAnchors = new Table(
  {
    date: column.text,
    t0_timestamp: column.integer,
    water_ml: column.integer,
  },
  { indexes: { daily_anchors_date: ['date'] } },
);

// Local-only so we don't need a backend connector for the spike.
export const powersyncSchema = new Schema({
  supplements,
  schedule_rules: scheduleRules,
  dose_logs: doseLogs,
  daily_anchors: dailyAnchors,
});

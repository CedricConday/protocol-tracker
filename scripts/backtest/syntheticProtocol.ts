/**
 * Synthetic high-dose-D3 regimen used as back-test input.
 *
 * Structure only — 26 dose slots over six anchors offset from T=0 (morning,
 * late morning, midday, afternoon, evening, night), which is the shape a full
 * protocol day takes. Names are generic; this is deliberately NOT anyone's real
 * plan, and no patient, practitioner, or product data belongs in this file.
 */
import { getDb } from '../../src/db/schema';

const MO = 0, VM = 180, MI = 300, NM = 480, AB = 660, NA = 900;

const SUPPLEMENTS = [
  { id: 'd3',        name: 'Vitamin D3',        form: 'capsule', category: 'core' },
  { id: 'vit_k2',    name: 'Vitamin K2 MK-7',   form: 'capsule', category: 'cofactor' },
  { id: 'magnesium', name: 'Magnesium',         form: 'capsule', category: 'core' },
  { id: 'omega3',    name: 'Omega 3',           form: 'liquid',  category: 'core' },
  { id: 'b_complex', name: 'B-Complex',         form: 'capsule', category: 'cofactor' },
  { id: 'vit_b2',    name: 'Vitamin B2',        form: 'capsule', category: 'cofactor' },
  { id: 'choline',   name: 'Choline',           form: 'capsule', category: 'cofactor' },
  { id: 'zinc',      name: 'Zinc',              form: 'tablet',  category: 'mineral' },
  { id: 'selenium',  name: 'Selenium',          form: 'tablet',  category: 'mineral' },
  { id: 'msm',       name: 'MSM',               form: 'capsule', category: 'core' },
  { id: 'nac',       name: 'NAC',               form: 'capsule', category: 'core' },
  { id: 'fibre',     name: 'Fibre',             form: 'capsule', category: 'support' },
  { id: 'night_cap', name: 'Night capsule',     form: 'capsule', category: 'core' },
];

const RULES: Array<[string, number, number, number]> = [
  // [supplement_id, offset_minutes, tolerance_window, with_food]
  ['d3',        VM, 30, 1],
  ['vit_k2',    VM, 30, 1],
  ['omega3',    MO, 30, 1],
  ['b_complex', MO, 60, 1],
  ['choline',   MO, 30, 1],
  ['choline',   AB, 30, 1],
  ['magnesium', MO, 30, 1],
  ['magnesium', MI, 30, 1],
  ['magnesium', AB, 30, 1],
  ['vit_b2',    MI, 30, 1],
  ['vit_b2',    AB, 30, 1],
  ['selenium',  MO, 30, 1],
  ['zinc',      MO, 30, 1],
  ['msm',       MO, 30, 1],
  ['msm',       MI, 30, 1],
  ['msm',       AB, 30, 1],
  ['nac',       MO, 30, 1],
  ['nac',       AB, 30, 1],
  ['fibre',     NM, 60, 0],
  ['night_cap', NA, 30, 0],
];

export const DOSES_PER_DAY = RULES.length;

export async function seedSyntheticProtocol(startDate: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, name, weight_kg, start_date, timezone, bedtime_hour, bedtime_minute)
     VALUES (1, 'Backtest Subject', 70, ?, 'Europe/Berlin', 22, 0)`,
    [startDate],
  );
  for (const s of SUPPLEMENTS) {
    await db.runAsync(
      'INSERT OR IGNORE INTO supplements (id, name, form, category, notes) VALUES (?, ?, ?, ?, ?)',
      [s.id, s.name, s.form, s.category, ''],
    );
  }
  let order = 1;
  for (const [id, offset, tol, food] of RULES) {
    await db.runAsync(
      `INSERT INTO schedule_rules
         (supplement_id, anchor_type, offset_minutes, tolerance_window, with_food, dose_amount, dose_unit, display_order)
       VALUES (?, 't0', ?, ?, ?, '1', 'unit', ?)`,
      [id, offset, tol, food, order++],
    );
  }
}

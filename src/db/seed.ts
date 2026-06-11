import { getDb } from './schema';
import { AWARENESS_DATES } from './awarenessData';

// the patient's actual stack — your prescriber Einnahme-Tagesplan (05.03.2026, [redacted])
// followed by Sabine the specialist (Heilpraktikerin) addendum (02.06.2026).
// Order matches the the prescriber sheet top-to-bottom, the specialist appended.
// Slot mapping from T0 (morning anchor):
//   MO=0  VM=180  MI=300  NM=480  AB=660  NA=900
const SUPPLEMENTS = [
  { id: 'vit_adek',        name: 'Vitamin ADEK 5000 IE',       form: 'capsule', category: 'core',     notes: 'Fat-soluble cluster (A+D+E+K). 8 caps with late-morning meal. Stop during antibiotics. Dosed for [redacted].' },
  { id: 'omega3',          name: 'Omega 3 Norsan vegan',       form: 'liquid',  category: 'core',     notes: '1 teaspoon with morning meal.' },
  { id: 'linseed_oil',     name: 'Linseed oil (Leinöl)',       form: 'liquid',  category: 'core',     notes: '1 tablespoon with morning meal.' },
  { id: 'b_complex',       name: 'B-Complex',                  form: 'capsule', category: 'cofactor', notes: '1 cap. Hold for 3 days before scheduled PTH / blood draw.' },
  { id: 'choline',         name: 'Choline 235 mg',             form: 'capsule', category: 'cofactor', notes: '1 cap morning, 1 cap evening.' },
  { id: 'magnesium',       name: 'Magnesium 300 mg',           form: 'capsule', category: 'core',     notes: '3× daily (morning / lunch / evening) with meals.' },
  { id: 'vit_b2',          name: 'Vitamin B2 active 25 mg',    form: 'capsule', category: 'cofactor', notes: '1 cap lunch, 1 cap evening.' },
  { id: 'selenium',        name: 'Selenium 200 µg',            form: 'tablet',  category: 'mineral',  notes: '1 tab morning. Antioxidant.' },
  { id: 'zinc',            name: 'Zinc 25 mg',                 form: 'tablet',  category: 'mineral',  notes: '1 tab morning. Separates from magnesium ideally; soft conflict only.' },
  { id: 'msm',             name: 'MSM 1 g',                    form: 'capsule', category: 'core',     notes: '2 caps × 3/day (morning / lunch / evening). For pain — up to 10 g/day.' },
  { id: 'nac',             name: 'NAC 600 mg',                 form: 'capsule', category: 'core',     notes: '1 cap morning, 1 cap evening.' },
  { id: 'nattokinase',     name: 'Nattokinase 100 mg',         form: 'capsule', category: 'core',     notes: 'Fasted: 30 min before meal or 2 h after. Morning dose primary; second night dose optional.' },
  { id: 'nicotine_patch',  name: 'Nicotine patch 3,5 mg',      form: 'patch',   category: 'prn',      notes: 'PRN — only during active infection. idealo.de 21 mg patch cut down.' },
  { id: 'lithium_orotate', name: 'Lithium Orotate 5 mg',       form: 'tablet',  category: 'core',     notes: '1 tab morning. iherb.de.' },
  { id: 'ldn',             name: 'LDN 3,5 mg',                 form: 'capsule', category: 'core',     notes: 'Low-Dose Naltrexone — 1 cap at bedtime. Prescription required.' },
  // Sabine the specialist addendum 02.06.2026
  { id: 'hepar_sl',        name: 'Hepar-SL 320 mg',            form: 'capsule', category: 'addendum', notes: 'PZN 9530432. 2 caps with each of two main meals (lunch + evening).' },
  { id: 'colostrum',       name: 'ARKTIS Colostrum strong',    form: 'capsule', category: 'addendum', notes: 'PZN 16024209. 2 caps fasted — morning before breakfast or before bed. arktisbiopharma.de code 274-sh/490 (15% off first order).' },
  { id: 'psyllium',        name: 'Psyllium husk (Aleavedis)',  form: 'capsule', category: 'addendum', notes: 'PZN 108115. Up to 8 caps with plenty of water. Keep ≥1 h away from other meds.' },
];

// Schedule rules — offset_minutes from T0 (morning anchor).
// the prescriber sheet timing is literal; soft conflicts handled via supplement_conflicts.
const SCHEDULE_RULES = [
  // Vitamin ADEK — VM (late morning)
  { supplement_id: 'vit_adek',        offset_minutes: 180, tolerance_window: 30, with_food: true,  dose_amount: '8',    dose_unit: 'caps',       display_order: 1 },

  // Omega 3 — MO
  { supplement_id: 'omega3',          offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '1',    dose_unit: 'tsp',        display_order: 2 },

  // Linseed oil — MO
  { supplement_id: 'linseed_oil',     offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '1',    dose_unit: 'tbsp',       display_order: 3 },

  // B-Complex — MO (sheet leaves time blank; defaulting to morning)
  { supplement_id: 'b_complex',       offset_minutes:   0, tolerance_window: 60, with_food: true,  dose_amount: '1',    dose_unit: 'cap',        display_order: 4 },

  // Choline 235 mg — MO + AB
  { supplement_id: 'choline',         offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '235',  dose_unit: 'mg',         display_order: 5 },
  { supplement_id: 'choline',         offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '235',  dose_unit: 'mg',         display_order: 6 },

  // Magnesium 300 mg — MO + MI + AB
  { supplement_id: 'magnesium',       offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '300',  dose_unit: 'mg',         display_order: 7 },
  { supplement_id: 'magnesium',       offset_minutes: 300, tolerance_window: 30, with_food: true,  dose_amount: '300',  dose_unit: 'mg',         display_order: 8 },
  { supplement_id: 'magnesium',       offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '300',  dose_unit: 'mg',         display_order: 9 },

  // Vit B2 active 25 mg — MI + AB
  { supplement_id: 'vit_b2',          offset_minutes: 300, tolerance_window: 30, with_food: true,  dose_amount: '25',   dose_unit: 'mg',         display_order: 10 },
  { supplement_id: 'vit_b2',          offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '25',   dose_unit: 'mg',         display_order: 11 },

  // Selenium 200 µg — MO
  { supplement_id: 'selenium',        offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '200',  dose_unit: 'µg',         display_order: 12 },

  // Zinc 25 mg — MO
  { supplement_id: 'zinc',            offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '25',   dose_unit: 'mg',         display_order: 13 },

  // MSM 1 g (2 caps) — MO + MI + AB
  { supplement_id: 'msm',             offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '2',    dose_unit: 'g',          display_order: 14 },
  { supplement_id: 'msm',             offset_minutes: 300, tolerance_window: 30, with_food: true,  dose_amount: '2',    dose_unit: 'g',          display_order: 15 },
  { supplement_id: 'msm',             offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '2',    dose_unit: 'g',          display_order: 16 },

  // NAC 600 mg — MO + AB
  { supplement_id: 'nac',             offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '600',  dose_unit: 'mg',         display_order: 17 },
  { supplement_id: 'nac',             offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '600',  dose_unit: 'mg',         display_order: 18 },

  // Nattokinase 100 mg — MO fasted (sheet shows '?' for NA dose; second dose held off until clarified)
  { supplement_id: 'nattokinase',     offset_minutes:   0, tolerance_window: 60, with_food: false, dose_amount: '100',  dose_unit: 'mg',         display_order: 19 },

  // Nicotine patch — PRN, surfaced at MO so it shows up when toggled on
  { supplement_id: 'nicotine_patch',  offset_minutes:   0, tolerance_window: 60, with_food: false, dose_amount: '3.5',  dose_unit: 'mg',         display_order: 20 },

  // Lithium Orotate 5 mg — MO
  { supplement_id: 'lithium_orotate', offset_minutes:   0, tolerance_window: 30, with_food: true,  dose_amount: '5',    dose_unit: 'mg',         display_order: 21 },

  // LDN 3,5 mg — NA (bedtime)
  { supplement_id: 'ldn',             offset_minutes: 900, tolerance_window: 30, with_food: false, dose_amount: '3.5',  dose_unit: 'mg',         display_order: 22 },

  // Hepar-SL 320 mg — 2 caps × 2 main meals (MI + AB)
  { supplement_id: 'hepar_sl',        offset_minutes: 300, tolerance_window: 30, with_food: true,  dose_amount: '2',    dose_unit: 'caps',       display_order: 23 },
  { supplement_id: 'hepar_sl',        offset_minutes: 660, tolerance_window: 30, with_food: true,  dose_amount: '2',    dose_unit: 'caps',       display_order: 24 },

  // ARKTIS Colostrum strong — 2 caps fasted MO
  { supplement_id: 'colostrum',       offset_minutes:   0, tolerance_window: 60, with_food: false, dose_amount: '2',    dose_unit: 'caps',       display_order: 25 },

  // Psyllium husk — flexible afternoon slot, away from meds
  { supplement_id: 'psyllium',        offset_minutes: 480, tolerance_window: 60, with_food: false, dose_amount: 'up to 8', dose_unit: 'caps',    display_order: 26 },
];

// Soft conflicts — UI warnings, not auto-shifts. the prescriber timing is honored as-is.
const CONFLICTS = [
  { supplement_id_a: 'zinc',     supplement_id_b: 'magnesium', min_separation_minutes: 60,  notes: 'Zinc and magnesium compete for absorption — ideally space, but the prescriber plan schedules both at MO.' },
  { supplement_id_a: 'zinc',     supplement_id_b: 'selenium',  min_separation_minutes: 60,  notes: 'Separate for optimal absorption of both.' },
  { supplement_id_a: 'psyllium', supplement_id_b: 'ldn',         min_separation_minutes: 120, notes: 'Psyllium can bind LDN — keep ≥2 h apart.' },
  { supplement_id_a: 'psyllium', supplement_id_b: 'hepar_sl',    min_separation_minutes: 60,  notes: 'Psyllium can reduce absorption — separate by ≥1 h.' },
  { supplement_id_a: 'psyllium', supplement_id_b: 'nattokinase', min_separation_minutes: 120, notes: 'Psyllium can reduce absorption — keep ≥2 h apart.' },
  { supplement_id_a: 'psyllium', supplement_id_b: 'lithium_orotate', min_separation_minutes: 60, notes: 'Psyllium can reduce absorption — separate by ≥1 h.' },
];

export async function seedDb(): Promise<void> {
  const db = await getDb();

  // Ensure blood_test_reminders singleton row exists
  await db.runAsync('INSERT OR IGNORE INTO blood_test_reminders (id, interval_days) VALUES (1, 90)');

  // Seed awareness_dates independently
  const awarenessSeeded = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM awareness_dates'
  );
  if (!awarenessSeeded || awarenessSeeded.count === 0) {
    await db.withTransactionAsync(async () => {
      for (const a of AWARENESS_DATES) {
        await db.runAsync(
          'INSERT OR IGNORE INTO awareness_dates (id, title, month, day, message) VALUES (?, ?, ?, ?, ?)',
          [a.id, a.title, a.month, a.day, a.message]
        );
      }
    });
  }

  // Seed dietary_restrictions independently (may already exist from migration)
  const restrictedSeeded = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM dietary_restrictions'
  );
  if (!restrictedSeeded || restrictedSeeded.count === 0) {
    const DIETARY_RESTRICTIONS: {
      ingredient: string; aliases: string; severity: string; notes: string;
    }[] = [
      { ingredient: 'dairy', aliases: 'Milch, Laktose, Magermilchpulver, Molke', severity: 'forbidden', notes: 'All dairy products are forbidden under your prescriber protocol' },
      { ingredient: 'calcium-fortified plant milk', aliases: '', severity: 'forbidden', notes: 'Fortified plant milks contain added calcium' },
      { ingredient: 'green juice', aliases: '', severity: 'forbidden', notes: 'Green juices and smoothies are forbidden' },
      { ingredient: 'mate', aliases: 'chimarrão', severity: 'forbidden', notes: 'Mate tea and chimarrão are forbidden' },
      { ingredient: 'poppy seed', aliases: '', severity: 'forbidden', notes: '' },
      { ingredient: 'sesame seed', aliases: 'Sesam', severity: 'forbidden', notes: '' },
      { ingredient: 'chia seed', aliases: '', severity: 'forbidden', notes: '' },
      { ingredient: 'quinoa', aliases: '', severity: 'forbidden', notes: '' },
      { ingredient: 'sardines', aliases: '', severity: 'forbidden', notes: '' },
      { ingredient: 'tahini', aliases: 'Tahini, Hummus', severity: 'forbidden', notes: 'Tahini-based foods are forbidden' },
      { ingredient: 'cola', aliases: '', severity: 'forbidden', notes: '' },
      { ingredient: 'calcium compound', aliases: 'E341, E333, E578, E516', severity: 'forbidden', notes: 'Calcium-based food additives (E-numbers)' },
      { ingredient: 'almonds', aliases: '', severity: 'caution', notes: 'Limit intake — contains calcium' },
      { ingredient: 'brazil nuts', aliases: '', severity: 'caution', notes: 'Limit intake — contains calcium' },
      { ingredient: 'flaxseed', aliases: '', severity: 'caution', notes: 'Limit intake' },
      { ingredient: 'hazelnuts', aliases: '', severity: 'caution', notes: 'Limit intake — contains calcium' },
      { ingredient: 'walnuts', aliases: '', severity: 'caution', notes: 'Limit intake' },
      { ingredient: 'hemp seeds', aliases: '', severity: 'caution', notes: 'Limit intake' },
    ];

    await db.withTransactionAsync(async () => {
      for (const r of DIETARY_RESTRICTIONS) {
        await db.runAsync(
          'INSERT OR IGNORE INTO dietary_restrictions (ingredient, aliases, severity, notes, source) VALUES (?, ?, ?, ?, ?)',
          [r.ingredient, r.aliases, r.severity, r.notes, 'protocol_standard']
        );
      }
    });
  }

  // Check if supplements already seeded
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM supplements'
  );
  if (existing && existing.count > 0) return;

  await db.withTransactionAsync(async () => {
    for (const s of SUPPLEMENTS) {
      await db.runAsync(
        'INSERT OR IGNORE INTO supplements (id, name, form, category, notes) VALUES (?, ?, ?, ?, ?)',
        [s.id, s.name, s.form, s.category, s.notes]
      );
    }

    for (const r of SCHEDULE_RULES) {
      await db.runAsync(
        `INSERT INTO schedule_rules
         (supplement_id, anchor_type, offset_minutes, tolerance_window, with_food, dose_amount, dose_unit, display_order)
         VALUES (?, 't0', ?, ?, ?, ?, ?, ?)`,
        [r.supplement_id, r.offset_minutes, r.tolerance_window, r.with_food ? 1 : 0, r.dose_amount, r.dose_unit, r.display_order]
      );
    }

    for (const c of CONFLICTS) {
      await db.runAsync(
        'INSERT INTO supplement_conflicts (supplement_id_a, supplement_id_b, min_separation_minutes, notes) VALUES (?, ?, ?, ?)',
        [c.supplement_id_a, c.supplement_id_b, c.min_separation_minutes, c.notes]
      );
    }
  });
}

export async function createDefaultProfile(name: string, weight_kg: number): Promise<void> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, name, weight_kg, start_date, timezone, bedtime_hour, bedtime_minute)
     VALUES (1, ?, ?, ?, 'Europe/Berlin', 22, 0)`,
    [name, weight_kg, today]
  );
}

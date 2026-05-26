import { getDb } from './schema';
import { AWARENESS_DATES } from './awarenessData';

// the Protocol standard supplement stack
// Timing based on standard protocol — your prescriber specific doses to be entered at onboarding
const SUPPLEMENTS = [
  { id: 'vit_d3', name: 'Vitamin D3', form: 'softgel', category: 'core', notes: 'Anchor supplement. Fat-soluble — must be taken with fatty meal.' },
  { id: 'vit_k2', name: 'Vitamin K2 (MK-7)', form: 'softgel', category: 'core', notes: 'Fat-soluble. Directs calcium to bones, away from arteries.' },
  { id: 'omega3', name: 'Omega-3', form: 'softgel', category: 'core', notes: 'Fat-soluble. Take with main meal.' },
  { id: 'mag_citrate', name: 'Magnesium Citrate', form: 'capsule', category: 'core', notes: 'Essential D3 cofactor. First magnesium dose with morning meal.' },
  { id: 'mag_glycinate', name: 'Magnesium Glycinate', form: 'capsule', category: 'core', notes: 'Second magnesium dose — gentler, better tolerated in evening.' },
  { id: 'vit_b2', name: 'Vitamin B2 (Riboflavin)', form: 'tablet', category: 'cofactor', notes: 'Take with meal. May turn urine yellow — normal.' },
  { id: 'nicotinamide', name: 'Nicotinamide (B3)', form: 'capsule', category: 'cofactor', notes: 'Non-flushing form of B3.' },
  { id: 'zinc', name: 'Zinc', form: 'tablet', category: 'mineral', notes: 'Take 2h away from magnesium and calcium.' },
  { id: 'selenium', name: 'Selenium', form: 'tablet', category: 'mineral', notes: 'Antioxidant. Separate from zinc by 1h.' },
  { id: 'boron', name: 'Boron', form: 'capsule', category: 'mineral', notes: 'Take with dinner.' },
];

// Default schedule rules — offset in minutes from T=0
// Patient customizes doses at onboarding; these are structural defaults
const SCHEDULE_RULES = [
  // T+0: Core fat-soluble cluster with first meal
  { supplement_id: 'vit_d3', offset_minutes: 0, tolerance_window: 30, with_food: true, dose_amount: '40000', dose_unit: 'IU', display_order: 1 },
  { supplement_id: 'vit_k2', offset_minutes: 0, tolerance_window: 30, with_food: true, dose_amount: '200', dose_unit: 'mcg', display_order: 2 },
  { supplement_id: 'omega3', offset_minutes: 0, tolerance_window: 30, with_food: true, dose_amount: '2', dose_unit: 'g', display_order: 3 },
  { supplement_id: 'mag_citrate', offset_minutes: 0, tolerance_window: 30, with_food: true, dose_amount: '400', dose_unit: 'mg', display_order: 4 },
  { supplement_id: 'vit_b2', offset_minutes: 0, tolerance_window: 30, with_food: true, dose_amount: '15', dose_unit: 'mg', display_order: 5 },

  // T+2h: Zinc alone (away from magnesium)
  { supplement_id: 'zinc', offset_minutes: 120, tolerance_window: 30, with_food: false, dose_amount: '40', dose_unit: 'mg', display_order: 6 },

  // T+3h: Selenium (away from zinc)
  { supplement_id: 'selenium', offset_minutes: 180, tolerance_window: 30, with_food: false, dose_amount: '200', dose_unit: 'mcg', display_order: 7 },

  // T+4h: Nicotinamide
  { supplement_id: 'nicotinamide', offset_minutes: 240, tolerance_window: 60, with_food: false, dose_amount: '500', dose_unit: 'mg', display_order: 8 },

  // T+6h: Evening magnesium glycinate with dinner
  { supplement_id: 'mag_glycinate', offset_minutes: 360, tolerance_window: 60, with_food: true, dose_amount: '400', dose_unit: 'mg', display_order: 9 },

  // T+6h: Boron with dinner
  { supplement_id: 'boron', offset_minutes: 360, tolerance_window: 60, with_food: true, dose_amount: '—', dose_unit: 'mg', display_order: 10 },
];

const CONFLICTS = [
  { supplement_id_a: 'zinc', supplement_id_b: 'mag_citrate', min_separation_minutes: 120, notes: 'Zinc and magnesium compete for absorption' },
  { supplement_id_a: 'zinc', supplement_id_b: 'mag_glycinate', min_separation_minutes: 60, notes: 'Zinc and magnesium compete for absorption' },
  { supplement_id_a: 'zinc', supplement_id_b: 'selenium', min_separation_minutes: 60, notes: 'Separate for optimal absorption of both' },
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
          [r.ingredient, r.aliases, r.severity, r.notes, 'coimbra_standard']
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

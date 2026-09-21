import { getDb } from "./schema";
import { localDateStr, addSupplement } from "./queries";

/**
 * The /try/ web demo's dataset.
 *
 * WHY THIS IS NOT devSeed.ts
 * `devSeed` is `__DEV__`-only by design and deliberately writes NOTHING to
 * user_profile or supplements — on a developer's device the protocol is the
 * real one and must not be overwritten. The web demo is the opposite case:
 * there is no real patient, and a visitor who lands on an empty onboarding
 * screen sees none of the app. So this builds the whole thing, profile
 * included, and it is the only place in the codebase that invents a protocol.
 *
 * SAFETY
 * Gated on `EXPO_PUBLIC_DEMO === '1'`, which Expo inlines at export time. The
 * Android build is produced without it, so every call below is unreachable
 * there — the flag is a build-time constant, not a runtime check.
 *
 * NOT A RECOMMENDATION
 * The supplements are the Coimbra-protocol cofactor set at ordinary label
 * amounts, attached to a fictional patient, so the demo shows a full day of
 * stacked timings rather than one lonely row. Nobody's dose is derived from
 * this and nothing in the shipped app reads it.
 */

/** Bump to re-seed every demo browser on the next load. */
const DEMO_VERSION = "2026-09-21.1";
const FLAG = "demo_seed_version";
const DAYS = 60;

export const DEMO_ENABLED = process.env.EXPO_PUBLIC_DEMO === "1";

const PROTOCOL: Array<{
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: number;
  with_food: boolean;
  tolerance_window: number;
}> = [
  {
    name: "Vitamin D3",
    form: "capsule",
    dose_amount: "40000",
    dose_unit: "IU",
    offset_minutes: 0,
    with_food: true,
    tolerance_window: 30,
  },
  {
    name: "Vitamin K2 MK-7",
    form: "capsule",
    dose_amount: "200",
    dose_unit: "mcg",
    offset_minutes: 0,
    with_food: true,
    tolerance_window: 30,
  },
  {
    name: "Vitamin B2 Riboflavin",
    form: "tablet",
    dose_amount: "100",
    dose_unit: "mg",
    offset_minutes: 0,
    with_food: true,
    tolerance_window: 30,
  },
  {
    name: "Magnesium Glycinate",
    form: "capsule",
    dose_amount: "400",
    dose_unit: "mg",
    offset_minutes: 240,
    with_food: false,
    tolerance_window: 60,
  },
  {
    name: "Omega-3 EPA/DHA",
    form: "capsule",
    dose_amount: "1000",
    dose_unit: "mg",
    offset_minutes: 240,
    with_food: true,
    tolerance_window: 60,
  },
  {
    name: "Choline Citicoline",
    form: "capsule",
    dose_amount: "250",
    dose_unit: "mg",
    offset_minutes: 240,
    with_food: true,
    tolerance_window: 60,
  },
  {
    name: "Zinc Picolinate",
    form: "capsule",
    dose_amount: "15",
    dose_unit: "mg",
    offset_minutes: 600,
    with_food: false,
    tolerance_window: 60,
  },
  {
    name: "Boron",
    form: "capsule",
    dose_amount: "3",
    dose_unit: "mg",
    offset_minutes: 600,
    with_food: false,
    tolerance_window: 60,
  },
];

/**
 * Written as a patient keeping a record for a clinician would write them:
 * an observation, its timing, and what changed. No filler and no stray noise —
 * this page is read by people deciding whether the app is serious.
 */
const NOTES_GOOD = [
  "Steady day. No new symptoms and the usual afternoon fatigue did not arrive.",
  "Walked forty minutes without the leg heaviness that normally starts at twenty.",
  "Slept through for the first time this week. Noticeably clearer through the morning.",
  "Good day. Balance felt normal on the stairs, which it has not for a fortnight.",
  "No symptoms worth recording. Kept to the full schedule and drank the target water.",
  "Energy held into the evening. Cooked and cleared up without needing to sit down.",
  "Warm day and no heat sensitivity, which is a change from last month.",
  "Handwriting was steady again. The tremor noted on the 14th has not returned.",
];
const NOTES_MIXED = [
  "Slight tingling in the left hand through the afternoon, resolved by evening.",
  "Second dose about an hour late after a delayed lunch; otherwise on schedule.",
  "Broken sleep, woke twice. Energy lower through the morning, recovered after noon.",
  "Mild numbness in the right foot for roughly two hours, no weakness with it.",
  "Headache from mid-afternoon. Took the evening doses later than usual because of it.",
  "Eyes tired and focus slow to settle. No visual disturbance beyond that.",
  "Stiffness in both legs on waking, eased after about an hour of moving.",
  "Travelled today, so the anchor was late and the whole schedule shifted with it.",
];
const NOTES_POOR = [
  "Bad day. Fatigue from waking and I did not get past the morning doses.",
  "Numbness up the right side from mid-morning. Called the practice and logged it.",
  "Unwell with a cold; kept fluids up but the schedule went entirely.",
  "Heavy fatigue and word-finding difficulty through the afternoon. Rested.",
  "Dizzy on standing several times. Stopped and rested rather than pushing through.",
];

const EVENTS: Array<{
  type: string;
  notes: string;
  severity: number;
  cortisone_dose_mg: number | null;
}> = [
  {
    type: "symptom",
    notes:
      "Transient numbness, right foot, approximately two hours. No weakness.",
    severity: 2,
    cortisone_dose_mg: null,
  },
  {
    type: "symptom",
    notes: "Blurred vision in the left eye on waking, cleared within the hour.",
    severity: 3,
    cortisone_dose_mg: null,
  },
  {
    type: "pain",
    notes: "Band-like pain around the ribs through the evening.",
    severity: 3,
    cortisone_dose_mg: null,
  },
  {
    type: "relapse",
    notes:
      "Right-sided weakness and unsteady gait over three days. Reported to the neurologist.",
    severity: 4,
    cortisone_dose_mg: null,
  },
  {
    type: "cortisone",
    notes: "Day 1 of 3, intravenous methylprednisolone, as prescribed.",
    severity: 3,
    cortisone_dose_mg: 1000,
  },
  {
    type: "cortisone",
    notes: "Day 2 of 3, intravenous methylprednisolone, as prescribed.",
    severity: 2,
    cortisone_dose_mg: 1000,
  },
  {
    type: "cortisone",
    notes: "Day 3 of 3, intravenous methylprednisolone. Strength improving.",
    severity: 2,
    cortisone_dose_mg: 1000,
  },
  {
    type: "symptom",
    notes:
      "Pins and needles in both hands after a hot shower, settled on cooling.",
    severity: 1,
    cortisone_dose_mg: null,
  },
];

const MOODS = ["😄", "🙂", "😐", "😔", "😞"];

/** Deterministic, so every visitor sees the same 60 days. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

async function alreadySeeded(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM misc_flags WHERE key = ?",
    [FLAG],
  );
  return row?.value === DEMO_VERSION;
}

/**
 * Build the demo from nothing. Everything the visitor could have typed on a
 * previous visit is cleared first: the point of a demo is that it looks the
 * same to the next person, and a half-finished profile from someone else's
 * session is worse than an empty one.
 */
export async function seedWebDemo(): Promise<void> {
  if (!DEMO_ENABLED) return;
  if (await alreadySeeded()) return;

  const db = await getDb();
  await db.execAsync(`
    DELETE FROM user_profile; DELETE FROM supplements; DELETE FROM schedule_rules;
    DELETE FROM supplement_conflicts; DELETE FROM daily_anchors; DELETE FROM dose_logs;
    DELETE FROM water_logs; DELETE FROM exercise_logs; DELETE FROM journal_entries;
    DELETE FROM relapse_events; DELETE FROM sun_log; DELETE FROM meal_log;
    DELETE FROM lab_results; DELETE FROM mri_scans; DELETE FROM calcium_logs;
  `);

  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, name, start_date, timezone, bedtime_hour, bedtime_minute)
     VALUES (1, 'Test Patient', ?, 'Europe/Berlin', 22, 30)`,
    [localDateStr(start)],
  );

  for (const s of PROTOCOL) await addSupplement(s);

  const rules = await db.getAllAsync<{
    id: number;
    supplement_id: string;
    offset_minutes: number;
    tolerance_window: number;
  }>(
    "SELECT id, supplement_id, offset_minutes, tolerance_window FROM schedule_rules ORDER BY display_order, id",
  );

  const rand = rng(20260921);
  const eventDays = new Set(
    [52, 41, 33, 24, 23, 22, 21, 9].map((d) => DAYS - d),
  );

  // One transaction for the whole window. Sixty days is ~1,200 inserts, and
  // committing each one separately kept the browser on the splash screen long
  // enough to look like a hang — the boot awaits this before Navigation mounts,
  // so a slow seed is a blank app, not a late one.
  await db.withTransactionAsync(async () => {
    for (let i = DAYS; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = localDateStr(d);
      const dayIndex = DAYS - i;

      // One visibly bad week, so the history reads as a record rather than a
      // marketing screenshot: rings drop, then recover.
      const roughPatch = dayIndex >= 21 && dayIndex <= 27;
      const roll = rand();
      const shape = roughPatch
        ? roll < 0.35
          ? "skipped"
          : "partial"
        : roll < 0.04
          ? "skipped"
          : roll < 0.16
            ? "partial"
            : "full";

      if (shape !== "skipped") {
        const t0 = new Date(`${date}T07:15:00`);
        t0.setMinutes(t0.getMinutes() + Math.floor(rand() * 50));
        const t0Ms = t0.getTime();

        const waterMl =
          shape === "partial"
            ? 750 + Math.floor(rand() * 3) * 250
            : 2000 + Math.floor(rand() * 3) * 250;
        await db.runAsync(
          "INSERT OR REPLACE INTO daily_anchors (date, t0_timestamp, water_ml) VALUES (?, ?, ?)",
          [date, t0Ms, waterMl],
        );
        for (let ml = 0; ml < waterMl; ml += 250) {
          await db.runAsync(
            "INSERT INTO water_logs (date, amount_ml, logged_at) VALUES (?, ?, ?)",
            [date, 250, new Date(t0Ms + ml * 60).toISOString()],
          );
        }

        if (shape === "full" && rand() > 0.3) {
          await db.runAsync(
            "INSERT INTO sun_log (date, minutes, uv_index, notes, logged_at) VALUES (?, ?, ?, ?, ?)",
            [
              date,
              15 + Math.floor(rand() * 4) * 5,
              null,
              "",
              new Date(t0Ms + 5 * 3600_000).toISOString(),
            ],
          );
        }
        if (shape === "full" && rand() > 0.5) {
          await db.runAsync(
            "INSERT INTO exercise_logs (date, duration_minutes, type, logged_at) VALUES (?, ?, ?, ?)",
            [
              date,
              20 + Math.floor(rand() * 5) * 10,
              "walk",
              new Date(t0Ms + 8 * 3600_000).toISOString(),
            ],
          );
        }

        let dayTaken = 0;
        for (const rule of rules) {
          const scheduled = t0Ms + rule.offset_minutes * 60_000;
          const missed =
            shape === "partial"
              ? rule.offset_minutes > 0 && rand() < 0.75
              : rand() < 0.05;
          const status = missed
            ? rand() < 0.35
              ? "skipped"
              : "missed"
            : "taken";
          const logged = missed
            ? null
            : scheduled + Math.floor(rand() * rule.tolerance_window) * 60_000;
          await db.runAsync(
            `INSERT INTO dose_logs (date, supplement_id, rule_id, scheduled_time, logged_time, status, missed_alerted)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [date, rule.supplement_id, rule.id, scheduled, logged, status],
          );
          if (!missed) dayTaken += 1;
        }

        const pct =
          rules.length > 0 ? Math.round((dayTaken / rules.length) * 100) : 0;
        const pool =
          pct >= 85 ? NOTES_GOOD : pct >= 50 ? NOTES_MIXED : NOTES_POOR;
        const mood =
          pct >= 85
            ? MOODS[Math.floor(rand() * 2)]
            : pct >= 50
              ? MOODS[1 + Math.floor(rand() * 2)]
              : MOODS[3 + Math.floor(rand() * 2)];
        const stamp = new Date(t0Ms + 14 * 3600_000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        await db.runAsync(
          `INSERT INTO journal_entries (date, mood, note, compliance_pct, doses_taken, doses_total, created_at, updated_at, dietary_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            date,
            mood,
            pool[Math.floor(rand() * pool.length)],
            pct,
            dayTaken,
            rules.length,
            stamp,
            stamp,
            "",
          ],
        );
      }

      if (eventDays.has(dayIndex)) {
        const e =
          EVENTS[
            [...eventDays].sort((a, b) => a - b).indexOf(dayIndex) %
              EVENTS.length
          ];
        await db.runAsync(
          `INSERT INTO relapse_events (date, type, cortisone_dose_mg, notes, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            date,
            e.type,
            e.cortisone_dose_mg,
            e.notes,
            e.severity,
            `${date}T12:00:00.000Z`,
          ],
        );
      }
    }
  });

  await db.runAsync(
    "INSERT OR REPLACE INTO misc_flags (key, value) VALUES (?, ?)",
    [FLAG, DEMO_VERSION],
  );
}

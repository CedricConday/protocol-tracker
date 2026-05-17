import { getProfile, getStreak } from '../db/queries';
import { getDb } from '../db/schema';

export async function buildHealthContext(): Promise<string> {
  try {
    const profile = await getProfile();
    const streak = await getStreak();
    const db = await getDb();

    const last30 = await db.getAllAsync<{ date: string; total: number; taken: number }>(
      `SELECT date, COUNT(*) as total,
              SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken
       FROM dose_logs WHERE date >= date('now', '-30 days')
       GROUP BY date ORDER BY date`
    );

    const journals = await db.getAllAsync<{ date: string; mood: string; note: string }>(
      "SELECT date, mood, note FROM journal_entries ORDER BY date DESC LIMIT 14"
    );

    const relapses = await db.getAllAsync<{ date: string; type: string; severity: number | null }>(
      'SELECT date, type, severity FROM relapse_events ORDER BY date DESC LIMIT 10'
    );

    const totalDoses = last30.reduce((s, r) => s + r.total, 0);
    const takenDoses = last30.reduce((s, r) => s + r.taken, 0);
    const avgCompliance = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

    const mostMissed = await db.getFirstAsync<{ name: string; count: number }>(
      `SELECT s.name, COUNT(*) as count 
       FROM dose_logs dl
       JOIN supplements s ON dl.supplement_id = s.id
       WHERE dl.status = 'missed' AND dl.date >= date('now', '-30 days')
       GROUP BY dl.supplement_id ORDER BY count DESC LIMIT 1`
    );

    let context = `Patient: ${profile?.name ?? 'Unknown'}`;
    context += `\nWeight: ${profile?.weight_kg ?? 'N/A'} kg`;
    context += `\nD3 Dose: N/A`;
    
    context += `\n\n30-Day Compliance: ${avgCompliance}% (${takenDoses}/${totalDoses} doses)`;
    context += `\nCurrent Streak: ${streak} days`;
    if (mostMissed) {
      context += `\nMost Missed Supplement: ${mostMissed.name} (${mostMissed.count} times in 30d)`;
    }

    const latestSun = await db.getFirstAsync<{ minutes: number }>(
      "SELECT minutes FROM sun_log WHERE date >= date('now', '-7 days') ORDER BY date DESC LIMIT 1"
    );
    const avgWater = await db.getFirstAsync<{ avg: number }>(
      "SELECT ROUND(AVG(water_ml)) as avg FROM day_anchors WHERE date >= date('now', '-7 days')"
    );
    const avgExercise = await db.getFirstAsync<{ avg: number }>(
      "SELECT ROUND(AVG(exercise_minutes)) as avg FROM day_anchors WHERE date >= date('now', '-7 days')"
    );

    context += `\n\nSun (last 7d): ${latestSun?.minutes ?? 0} min avg daily`;
    context += `\nWater (7d avg): ${avgWater?.avg ?? 0} ml`;
    context += `\nExercise (7d avg): ${avgExercise?.avg ?? 0} min`;

    if (journals.length > 0) {
      context += '\n\nRecent Journal Entries:';
      for (const j of journals) {
        context += `\n- ${j.date}: [${j.mood}] ${j.note || '-'}`;
      }
    }

    if (relapses.length > 0) {
      context += '\n\nRelapse Events:';
      for (const r of relapses) {
        context += `\n- ${r.date}: ${r.type}${r.severity ? ` (severity ${r.severity})` : ''}`;
      }
    }

    return context;
  } catch (e) {
    console.error('Context build error:', e);
    return 'Unable to build health context.';
  }
}

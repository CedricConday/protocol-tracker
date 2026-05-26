import { getDb } from '../db/schema';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

async function getPatientJwt(): Promise<string | null> {
  try {
    const { getItemAsync } = await import('expo-secure-store');
    return getItemAsync('patient_jwt');
  } catch {
    return null;
  }
}

export async function uploadPendingActions(): Promise<void> {
  try {
    const jwt = await getPatientJwt();
    if (!jwt) return;
    const db = await getDb();
    const pending = await db.getAllAsync<{ id: number; action_type: string; payload: string }>(
      "SELECT id, action_type, payload FROM action_queue WHERE synced = 0 LIMIT 50"
    );
    if (pending.length === 0) return;
    const res = await fetch(`${API_BASE}/sync/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      body: JSON.stringify({ events: pending.map((a) => ({ type: a.action_type, payload: a.payload })) }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        const { deleteItemAsync } = await import('expo-secure-store');
        await deleteItemAsync('patient_jwt');
      }
      return;
    }
    const ids = pending.map((a) => a.id);
    for (const id of ids) {
      await db.runAsync('UPDATE action_queue SET synced = 1 WHERE id = ?', [id]);
    }
  } catch (e) {
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO misc_flags (key, value) VALUES ('last_sync_error', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(e)]
    );
  }
}

export async function fetchRecommendations(): Promise<void> {
  try {
    const jwt = await getPatientJwt();
    if (!jwt) return;
    const res = await fetch(`${API_BASE}/sync/patient/recommendations`, {
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.recommendations?.length) {
      const db = await getDb();
      for (const rec of data.recommendations) {
        await db.runAsync(
          `INSERT OR IGNORE INTO protocol_recommendations (id, patient_id, parameter, recommended_value, sent_at, acknowledged)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [rec.id, rec.patient_id, rec.parameter, rec.recommended_value, rec.sent_at]
        );
      }
    }
  } catch {
    // offline
  }
}

export async function fetchDoctorFlags(): Promise<void> {
  try {
    const jwt = await getPatientJwt();
    if (!jwt) return;
    const res = await fetch(`${API_BASE}/sync/patient/flags`, {
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.flagged !== undefined) {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO misc_flags (key, value) VALUES ('doctor_flagged', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [data.flagged ? 'true' : 'false']
      );
    }
  } catch {
    // offline
  }
}

export async function activatePatientWithCode(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/invites/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: code }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error || 'Activation failed' };
    if (data.jwt) {
      const { setItemAsync } = await import('expo-secure-store');
      await setItemAsync('patient_jwt', data.jwt);
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Check your connection.' };
  }
}

export async function syncAll(): Promise<void> {
  await uploadPendingActions();
  await fetchRecommendations();
  await fetchDoctorFlags();
}

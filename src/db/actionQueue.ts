import { getDb } from './schema';

export interface ActionQueueItem {
  id?: number;
  action_type: string;
  payload: string;
  created_at: string;
  synced: number;
}

export async function enqueueAction(type: string, payload: object): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO action_queue (action_type, payload, created_at, synced) VALUES (?, ?, datetime('now'), 0)`,
    [type, JSON.stringify(payload)]
  );
}

export async function getPendingActions(): Promise<ActionQueueItem[]> {
  const db = await getDb();
  return db.getAllAsync<ActionQueueItem>(
    'SELECT * FROM action_queue WHERE synced = 0 ORDER BY created_at ASC'
  );
}

export async function markSynced(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE action_queue SET synced = 1 WHERE id = ?', [id]);
}

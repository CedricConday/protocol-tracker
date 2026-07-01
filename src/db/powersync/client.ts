// [PowerSync spike] Local-only PowerSyncDatabase. No backend — we're
// evaluating the local-first API shape and setup cost. A real integration
// would add a PowerSyncBackendConnector pointing at Postgres/Supabase.
import { PowerSyncDatabase } from '@powersync/react-native';
import { powersyncSchema } from './schema';

export const powersyncDb = new PowerSyncDatabase({
  schema: powersyncSchema,
  database: { dbFilename: 'powersync_spike.db' },
});

import mongoose from 'mongoose';

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
    migratedIndexes: boolean;
  };
}

global._mongooseCache = global._mongooseCache ?? { conn: null, promise: null, migratedIndexes: false };

/** Drop stale indexes left over from old schema versions. Runs once per process. */
async function dropLegacyIndexes(conn: typeof mongoose) {
  if (global._mongooseCache.migratedIndexes) return;
  global._mongooseCache.migratedIndexes = true;
  try {
    const db = conn.connection.db;
    if (!db) return;
    // Drop the old unique `date` index that conflicts with startDate/endDate schema
    await db.collection('pickupslots').dropIndex('date_1').catch(() => {
      // Index doesn't exist — nothing to do
    });
  } catch {
    // Non-fatal: log but never crash the server
    console.warn('[dbConnect] Could not drop legacy indexes — skipping');
  }
}

export default async function dbConnect() {
  if (global._mongooseCache.conn) {
    await dropLegacyIndexes(global._mongooseCache.conn);
    return global._mongooseCache.conn;
  }

  if (!global._mongooseCache.promise) {
    global._mongooseCache.promise = mongoose.connect(process.env.MONGO_URI!, {
      dbName: 'SpiceMagik',
      bufferCommands: false,
    });
  }

  global._mongooseCache.conn = await global._mongooseCache.promise;
  await dropLegacyIndexes(global._mongooseCache.conn);
  return global._mongooseCache.conn;
}

import { asc, eq } from "drizzle-orm";
import type { ChubDatabase } from "../db/client.js";
import { preferences, type PreferenceRow } from "../db/schema.js";

export type PreferenceErrorCode = "invalid_value";

export class PreferenceError extends Error {
  constructor(readonly code: PreferenceErrorCode) {
    super(code);
    this.name = "PreferenceError";
  }
}

export interface PreferencesRepository {
  readAll(): PreferenceRow[];
  readOne(key: string): PreferenceRow | undefined;
  upsertOne(key: string, value: unknown): PreferenceRow;
}

function serializeValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new PreferenceError("invalid_value");
    return serialized;
  } catch (error) {
    if (error instanceof PreferenceError) throw error;
    throw new PreferenceError("invalid_value");
  }
}

export function createPreferencesRepository(db: ChubDatabase): PreferencesRepository {
  return {
    readAll(): PreferenceRow[] {
      return db.select().from(preferences).orderBy(asc(preferences.key)).all();
    },

    readOne(key: string): PreferenceRow | undefined {
      return db.select().from(preferences).where(eq(preferences.key, key)).get();
    },

    upsertOne(key: string, value: unknown): PreferenceRow {
      const serialized = serializeValue(value);
      const updatedAt = new Date().toISOString();
      db.insert(preferences)
        .values({ key, value: serialized, updatedAt })
        .onConflictDoUpdate({
          target: preferences.key,
          set: { value: serialized, updatedAt },
        })
        .run();
      return db.select().from(preferences).where(eq(preferences.key, key)).get()!;
    },
  };
}

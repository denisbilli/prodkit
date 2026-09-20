import type { DetectContext } from './detectContext';
import { hasAnyDartDep, hasAnyDep, hasAnyGradleDep, hasAnySwiftDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

/**
 * Where an application on somebody else's device writes things down.
 *
 * One list, read by the two capabilities that both ask this question and used to
 * answer it differently: `mobile.offline` — can this open with no network — and
 * `app.state-durability` — does the person's work survive. A second copy would drift,
 * and it already had: durability was written for a game in a browser and knew only
 * `localStorage` and four npm packages, so every native application measured came back
 * `partial` while keeping its data in Core Data or SQLite.
 */

/** Local databases declared as dependencies, by ecosystem. */
export const LOCAL_STORE_GRADLE = ['androidx.room', 'io.realm', 'io.objectbox', 'com.squareup.sqldelight', 'app.cash.sqldelight', 'androidx.datastore'];

export const LOCAL_STORE_SWIFT = [
  'groue/grdb.swift',
  'grdb.swift',
  'stephencelis/sqlite.swift',
  'sqlite.swift',
  'realm/realm-swift',
  'realm/realm-cocoa',
  'realmswift',
];

export const LOCAL_STORE_DEPS = [
  'sqflite',
  'drift',
  'hive',
  'isar',
  'objectbox',
  'realm',
  'watermelondb',
  '@nozbe/watermelondb',
  'react-native-mmkv',
  '@react-native-async-storage/async-storage',
  'redux-persist',
  '@tanstack/query-persist-client-core',
  'powersync',
];

/**
 * Storage the platform itself provides, which no dependency list will hold.
 *
 * Every entry above is a third-party database, and the two most widely used stores on
 * these platforms ship with the operating system: Core Data on Apple's,
 * `SQLiteDatabase` on Android's. Measured on two applications whose whole purpose is
 * working without a network — WordPress-iOS keeps its posts in Core Data,
 * thunderbird-android keeps its mail in SQLite — and both were told they store nothing
 * locally.
 *
 * Types the platform defines, not names an author picked: `NSManagedObjectContext`
 * belongs to Core Data and appears nowhere else, and `getWritableDatabase()` is the one
 * way an Android application opens its own database.
 */
export const PLATFORM_LOCAL_STORES = [
  /NSPersistentContainer|NSManagedObjectContext|NSPersistentStoreCoordinator/,
  /ModelContainer\s*\(|@Model\b/,
  /SQLiteOpenHelper|getWritableDatabase\s*\(|getReadableDatabase\s*\(/,
  /android\.database\.sqlite\.SQLiteDatabase/,
];

export interface LocalStoreReading {
  dependencies: string[];
  uses: Array<{ file: string; line: number; snippet: string }>;
}

/** Both halves of the question, so a caller can cite whichever it found. */
export async function readLocalStores(ctx: DetectContext, limit = 3): Promise<LocalStoreReading> {
  return {
    dependencies: [
      ...hasAnyDep(ctx, LOCAL_STORE_DEPS),
      ...hasAnyDartDep(ctx, LOCAL_STORE_DEPS),
      ...hasAnyGradleDep(ctx, LOCAL_STORE_GRADLE),
      ...hasAnySwiftDep(ctx, LOCAL_STORE_SWIFT),
    ],
    uses: await searchInFiles(ctx.root, ctx.files.source, PLATFORM_LOCAL_STORES, limit),
  };
}

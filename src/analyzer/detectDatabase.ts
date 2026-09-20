import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, hasAnyPyDep, hasAnyGoDep, hasAnyGradleDep, hasAnyRubyDep, hasAnyDotnetDep, hasAnyDartDep, type DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { JVM_DATABASES } from './catalogue';

/**
 * Managed data platforms, and the engine each one actually is.
 *
 * A repository built with an AI tool often has no database driver at all: the whole
 * data layer is a hosted service reached over HTTP. Read only for drivers, the
 * analyzer reported "Detected databases: unknown" for an app whose data layer was
 * perfectly clear — the first line of the report telling the reader the tool had not
 * understood their project. Supabase, the default in Lovable, Bolt and v0, was the
 * most common case of it.
 *
 * The engine matters as much as the platform: Supabase is Postgres and Turso is
 * SQLite, so rules written about an engine keep working without knowing about the
 * host. The platform is recorded separately, because whether the data sits on
 * infrastructure someone else operates is its own question for a readiness report.
 */
const MANAGED_PLATFORMS: Array<{
  platform: string;
  engine: string | null;
  npm: string[];
  py: string[];
}> = [
  {
    platform: 'supabase',
    engine: 'postgres',
    npm: ['@supabase/supabase-js', '@supabase/ssr', '@supabase/auth-helpers-nextjs', '@supabase/postgrest-js'],
    py: ['supabase', 'supabase-py'],
  },
  { platform: 'firebase', engine: 'firestore', npm: ['firebase', 'firebase-admin', '@angular/fire'], py: ['firebase-admin'] },
  { platform: 'planetscale', engine: 'mysql', npm: ['@planetscale/database'], py: [] },
  { platform: 'neon', engine: 'postgres', npm: ['@neondatabase/serverless'], py: [] },
  { platform: 'vercel-postgres', engine: 'postgres', npm: ['@vercel/postgres'], py: [] },
  { platform: 'turso', engine: 'sqlite', npm: ['@libsql/client', 'libsql'], py: ['libsql-client'] },
  { platform: 'upstash', engine: 'redis', npm: ['@upstash/redis'], py: ['upstash-redis'] },
  { platform: 'dynamodb', engine: 'dynamodb', npm: ['@aws-sdk/client-dynamodb', 'dynamoose'], py: [] },
  { platform: 'convex', engine: 'convex', npm: ['convex'], py: [] },
];

/**
 * Object-relational mappers. These prove there is a data layer without naming the
 * engine, so they are recorded on their own key; where the engine is written in a
 * schema file, it is read from there below.
 */
const ORMS: Array<{ orm: string; npm: string[]; py: string[] }> = [
  { orm: 'prisma', npm: ['@prisma/client', 'prisma'], py: [] },
  { orm: 'drizzle', npm: ['drizzle-orm'], py: [] },
  { orm: 'typeorm', npm: ['typeorm'], py: [] },
  { orm: 'sequelize', npm: ['sequelize'], py: [] },
  { orm: 'knex', npm: ['knex'], py: [] },
  { orm: 'mikro-orm', npm: ['@mikro-orm/core'], py: [] },
  { orm: 'kysely', npm: ['kysely'], py: [] },
  { orm: 'sqlalchemy', npm: [], py: ['sqlalchemy', 'alembic'] },
  { orm: 'tortoise', npm: [], py: ['tortoise-orm'] },
  { orm: 'peewee', npm: [], py: ['peewee'] },
];

/** Prisma and Drizzle both write the engine into a config file; this reads it. */
const SCHEMA_ENGINES: Array<[RegExp, string]> = [
  [/provider\s*=\s*['"]postgresql['"]/i, 'postgres'],
  [/provider\s*=\s*['"]mysql['"]/i, 'mysql'],
  [/provider\s*=\s*['"]sqlite['"]/i, 'sqlite'],
  [/provider\s*=\s*['"]mongodb['"]/i, 'mongodb'],
  [/provider\s*=\s*['"]cockroachdb['"]/i, 'postgres'],
  [/dialect\s*:\s*['"]postgresql['"]/i, 'postgres'],
  [/dialect\s*:\s*['"]mysql['"]/i, 'mysql'],
  [/dialect\s*:\s*['"]sqlite['"]/i, 'sqlite'],
];

export async function detectDatabase(ctx: DetectContext): Promise<{
  result: DetectorResult;
  extra: DetectorResult[];
  databases: string[];
}> {
  const databases = new Set<string>();
  const evidence: DetectorEvidence[] = [];

  const npmHits: Array<[string, string[]]> = [
    ['postgres', ['pg', 'postgres', 'postgresql']],
    ['mongodb', ['mongoose', 'mongodb']],
    ['sqlite', ['sqlite3', 'better-sqlite3']],
    ['mysql', ['mysql2', 'mysql']],
    ['redis', ['redis', 'ioredis', 'bull', 'bullmq']],
  ];
  for (const [db, names] of npmHits) {
    const hits = hasAnyDep(ctx, names);
    if (hits.length) {
      databases.add(db);
      for (const h of hits) evidence.push({ type: 'dependency', value: h });
    }
  }

  const pyHits: Array<[string, string[]]> = [
    ['postgres', ['psycopg2', 'psycopg2-binary', 'psycopg']],
    ['mysql', ['mysqlclient', 'pymysql']],
    ['redis', ['redis', 'celery']],
    ['sqlite', ['db.sqlite3']],
  ];
  for (const [db, names] of pyHits) {
    const hits = hasAnyPyDep(ctx, names);
    if (hits.length) {
      databases.add(db);
      for (const h of hits) evidence.push({ type: 'dependency', value: h });
    }
  }

  /**
   * The JVM, by driver coordinate.
   *
   * The same manifest that names Spring Boot names PostgreSQL, and a Spring Boot API
   * with `org.postgresql:postgresql` in its pom was reported as having no data layer.
   */
  for (const [db, names] of JVM_DATABASES) {
    const hits = hasAnyGradleDep(ctx, names);
    if (hits.length) {
      databases.add(db);
      for (const h of hits) evidence.push({ type: 'dependency', value: h });
    }
  }

  const goHits: Array<[string, string[]]> = [
    ['postgres', ['jackc/pgx', 'jackc/pgx/v5', 'lib/pq']],
    ['mysql', ['go-sql-driver/mysql']],
    ['sqlite', ['mattn/go-sqlite3', 'modernc.org/sqlite']],
    ['mongodb', ['mongo-driver']],
    ['redis', ['go-redis', 'redis/go-redis/v9']],
  ];
  for (const [db, names] of goHits) {
    const hits = hasAnyGoDep(ctx, names);
    if (!hits.length) continue;

    databases.add(db);
    for (const hit of hits) evidence.push({ type: 'dependency', value: hit });
  }

  const rubyHits: Array<[string, string[]]> = [
    ['postgres', ['pg']],
    ['mysql', ['mysql2']],
    ['sqlite', ['sqlite3']],
    ['mongodb', ['mongoid']],
    ['redis', ['redis']],
  ];
  for (const [db, names] of rubyHits) {
    const hits = hasAnyRubyDep(ctx, names);
    if (!hits.length) continue;

    databases.add(db);
    for (const hit of hits) evidence.push({ type: 'dependency', value: hit });
  }

  const dotnetHits: Array<[string, string[]]> = [
    ['postgres', ['Npgsql']],
    ['mysql', ['MySql.Data', 'Pomelo.EntityFrameworkCore.MySql']],
    ['sqlite', ['Microsoft.Data.Sqlite', 'Microsoft.EntityFrameworkCore.Sqlite']],
    ['sqlserver', ['Microsoft.Data.SqlClient', 'Microsoft.EntityFrameworkCore.SqlServer', 'System.Data.SqlClient']],
    ['mongodb', ['MongoDB.Driver']],
    ['redis', ['StackExchange.Redis']],
  ];
  for (const [db, names] of dotnetHits) {
    const hits = hasAnyDotnetDep(ctx, names);
    if (!hits.length) continue;

    databases.add(db);
    for (const hit of hits) evidence.push({ type: 'dependency', value: hit });
  }

  const dartHits: Array<[string, string[]]> = [
    ['sqlite', ['sqflite', 'drift', 'sqflite_common_ffi']],
    ['firestore', ['cloud_firestore', 'firebase_core']],
    ['postgres', ['supabase_flutter', 'postgres']],
  ];
  for (const [db, names] of dartHits) {
    const hits = hasAnyDartDep(ctx, names);
    if (!hits.length) continue;

    databases.add(db);
    for (const hit of hits) evidence.push({ type: 'dependency', value: hit });
  }

  // SQLite file
  if (ctx.files.all.some((f) => f.endsWith('db.sqlite3') || f.endsWith('.sqlite'))) {
    databases.add('sqlite');
    evidence.push({ type: 'file', value: 'sqlite db file detected' });
  }

  // docker-compose hints
  const composeFile = ctx.files.all.find((f) =>
    /(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/.test(f)
  );
  if (composeFile) {
    const text = (await readTextFileSafe(ctx.root, composeFile)) ?? '';
    const lower = text.toLowerCase();
    if (/image:\s*postgres/i.test(text) || lower.includes('postgres:')) {
      databases.add('postgres');
      evidence.push({ type: 'file', value: 'postgres in docker-compose', file: composeFile });
    }
    if (/image:\s*redis/i.test(text) || lower.includes('redis:')) {
      databases.add('redis');
      evidence.push({ type: 'file', value: 'redis in docker-compose', file: composeFile });
    }
    if (/image:\s*mysql/i.test(text)) {
      databases.add('mysql');
      evidence.push({ type: 'file', value: 'mysql in docker-compose', file: composeFile });
    }
    if (/image:\s*mongo/i.test(text)) {
      databases.add('mongodb');
      evidence.push({ type: 'file', value: 'mongo in docker-compose', file: composeFile });
    }
  }

  // DATABASE_URL env reference
  // (kept lightweight; not adding DB type from this alone)

  const platforms = new Set<string>();
  const platformEvidence: DetectorEvidence[] = [];

  for (const entry of MANAGED_PLATFORMS) {
    const hits = [...hasAnyDep(ctx, entry.npm), ...hasAnyPyDep(ctx, entry.py)];
    if (!hits.length) continue;

    platforms.add(entry.platform);
    if (entry.engine) databases.add(entry.engine);
    for (const h of hits) platformEvidence.push({ type: 'dependency', value: h });
  }

  const orms = new Set<string>();
  const ormEvidence: DetectorEvidence[] = [];

  for (const entry of ORMS) {
    const hits = [...hasAnyDep(ctx, entry.npm), ...hasAnyPyDep(ctx, entry.py)];
    if (!hits.length) continue;

    orms.add(entry.orm);
    for (const h of hits) ormEvidence.push({ type: 'dependency', value: h });
  }

  // The ORM names the engine in its own schema, which is more reliable than guessing
  // from a driver that a project using an ORM often does not depend on directly.
  const schemaFiles = ctx.files.all.filter((f) =>
    /(^|\/)schema\.prisma$/.test(f) || /(^|\/)drizzle\.config\.[cm]?[jt]s$/.test(f)
  );

  for (const file of schemaFiles) {
    const text = (await readTextFileSafe(ctx.root, file)) ?? '';

    for (const [pattern, engine] of SCHEMA_ENGINES) {
      if (!pattern.test(text)) continue;

      databases.add(engine);
      ormEvidence.push({ type: 'file', value: `${engine} declared in ${file}`, file });
    }
  }

  const dbs = Array.from(databases);
  const platformList = Array.from(platforms);
  const ormList = Array.from(orms);

  return {
    databases: dbs,
    result: {
      key: 'stack.database',
      present: dbs.length > 0,
      evidence: [...evidence, ...platformEvidence, ...ormEvidence],
      details: { databases: dbs },
    },
    extra: [
      {
        key: 'stack.dataPlatform',
        present: platformList.length > 0,
        evidence: platformEvidence,
        details: { platforms: platformList },
      },
      {
        key: 'stack.orm',
        present: ormList.length > 0,
        evidence: ormEvidence,
        details: { orms: ormList },
      },
    ],
  };
}

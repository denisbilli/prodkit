import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, hasAnyPyDep, hasAnyGoDep, hasAnyGradleDep, hasAnyRubyDep, hasAnyDotnetDep, hasAnyDartDep, hasAnyElixirDep, type DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { ELIXIR_DATABASES, JVM_DATABASES } from './catalogue';

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

  /**
   * Elixir, by driver package.
   *
   * Ecto is the query layer and names no store: `postgrex` is what makes it Postgres,
   * `ecto_ch` what makes it ClickHouse. plausible has both — its application data in
   * Postgres and its analytics in ClickHouse — and was reported as having no data
   * layer at all.
   */
  for (const [db, names] of ELIXIR_DATABASES) {
    const hits = hasAnyElixirDep(ctx, names);
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

  /**
   * Laravel, whose database is named in a configuration file rather than in a package.
   *
   * PHP has one driver — PDO, in the runtime — so `composer.json` says nothing about
   * which engine a project talks to, and nothing here read the place that does.
   * Firefly III reported no data layer at all, above a `config/database.php` whose
   * first line of substance is `'default' => env('DB_CONNECTION', 'mysql')`.
   *
   * Only the default is read. Laravel's file ships every driver it supports in the
   * `connections` array whether the project uses them or not, so reading those would
   * credit each project with four databases; the default is the one it actually falls
   * back to when nothing is configured, which is the project's own statement.
   */
  const LARAVEL_DRIVERS: Record<string, string> = {
    mysql: 'mysql',
    mariadb: 'mysql',
    pgsql: 'postgres',
    sqlite: 'sqlite',
    sqlsrv: 'sqlserver',
  };

  for (const file of ctx.files.all.filter((f) => /(^|\/)config\/database\.php$/.test(f))) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    const defaultLine = /^\s*'default'\s*=>.*?['"]([a-z]+)['"]/m.exec(text);
    const driver = defaultLine ? LARAVEL_DRIVERS[defaultLine[1]] : undefined;
    if (!driver) continue;

    databases.add(driver);
    evidence.push({
      type: 'snippet',
      value: defaultLine![0].trim().slice(0, 200),
      file,
      line: text.slice(0, defaultLine!.index).split('\n').length,
    });
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

  /**
   * Every compose file, not the first one in the list.
   *
   * A repository has several: `docker-compose.yml` beside `.devcontainer/
   * docker-compose.yml`, an override for tests, one per deployment shape. This read
   * whichever came back first and ignored the rest, so a Postgres declared only in
   * the production compose was invisible whenever a development one sorted ahead of
   * it — and which one that is was the filesystem's business until this session
   * sorted the scan.
   *
   * The devcontainer is not excluded here, and that is the difference from
   * `docker.presence` next door. "How does this ship" is answered by the image the
   * product is built into; "what does it store data in" is answered by the database
   * it talks to, and in development that is the one the devcontainer starts. The same
   * file, two questions, two answers.
   */
  const composeFiles = ctx.files.all.filter((f) =>
    /(^|\/)(docker-compose[\w.-]*\.ya?ml|compose[\w.-]*\.ya?ml)$/.test(f)
  ).slice(0, 8);
  /**
   * Each store cited once, from the first file that shows it.
   *
   * immich has seven compose files and all of them run Postgres and Redis, so reading
   * every one turned two facts into eleven citations of the same two facts. A reader
   * is promised a line they can open and argue with; eleven lines saying the same
   * thing is not eleven times the argument.
   */
  const COMPOSE_SERVICES: Array<[string, RegExp, RegExp | null]> = [
    ['postgres', /image:\s*postgres/i, /postgres:/i],
    ['redis', /image:\s*redis/i, /redis:/i],
    ['mysql', /image:\s*mysql/i, null],
    ['mongodb', /image:\s*mongo/i, null],
  ];

  /**
   * Counted for this reading only, not against `databases`: a store the dependencies
   * already named still deserves the compose line beside it, and skipping on the set
   * removed every compose citation from a project that declares its driver too.
   */
  const citedFromCompose = new Set<string>();

  for (const composeFile of composeFiles) {
    const text = (await readTextFileSafe(ctx.root, composeFile)) ?? '';

    for (const [name, image, service] of COMPOSE_SERVICES) {
      if (citedFromCompose.has(name)) continue;
      if (!image.test(text) && !(service && service.test(text))) continue;

      databases.add(name);
      citedFromCompose.add(name);
      evidence.push({ type: 'file', value: `${name} in docker-compose`, file: composeFile });
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

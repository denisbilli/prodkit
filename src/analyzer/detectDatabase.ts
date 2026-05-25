import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, hasAnyPyDep, type DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';

export async function detectDatabase(ctx: DetectContext): Promise<{
  result: DetectorResult;
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

  const dbs = Array.from(databases);
  return {
    databases: dbs,
    result: {
      key: 'stack.database',
      present: dbs.length > 0,
      evidence,
      details: { databases: dbs },
    },
  };
}

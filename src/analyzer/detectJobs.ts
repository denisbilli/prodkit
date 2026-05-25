import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectJobs(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const nodeDeps = hasAnyDep(ctx, ['bull', 'bullmq', 'node-cron', 'agenda']);
  const pyDeps = hasAnyPyDep(ctx, ['celery', 'apscheduler', 'rq']);
  for (const d of nodeDeps) evidence.push({ type: 'dependency', value: d });
  for (const d of pyDeps) evidence.push({ type: 'dependency', value: d });

  const workerFiles = ctx.files.all.filter((f) => /(workers?\/|worker\.|tasks\.py|backup|cleanup)/i.test(f)).slice(0, 20);
  for (const f of workerFiles) evidence.push({ type: 'file', value: f });

  const hits = await searchInFiles(ctx.root, ctx.files.source, [/queue/i, /worker/i, /cron/i, /celery/i], 20);
  for (const h of hits) evidence.push({ type: 'snippet', value: h.snippet, file: h.file, line: h.line });

  return {
    key: 'jobs.background',
    present: nodeDeps.length > 0 || pyDeps.length > 0 || workerFiles.length > 0 || hits.length > 0,
    evidence,
    details: {
      nodeQueue: nodeDeps.length > 0,
      pythonQueue: pyDeps.length > 0,
      workerFiles: workerFiles.length,
    },
  };
}

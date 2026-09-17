import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * Work that happens outside a request.
 *
 * `present` used to be satisfied by a bare /queue/i, /worker/i or /cron/i anywhere in
 * any source file. That matches a breadth-first search holding a `queue`, a browser
 * `Worker` in frontend code, and the word "cron" in a comment. Measured: a pirate game
 * was reported as having background jobs because of
 * `queue: deque[tuple[int, int]] = deque()` in a flood fill, and that single signal was
 * then enough to have the whole project judged as an AI SaaS.
 *
 * Presence now needs something declared rather than mentioned: a dependency on a queue
 * or scheduler, or a job actually being defined. The loose terms are still collected,
 * because they are useful context in a report — but context is all they are, and they
 * no longer decide the answer.
 */

const QUEUE_DEPS = [
  'bull',
  'bullmq',
  'node-cron',
  'agenda',
  'bee-queue',
  'kue',
  'pg-boss',
  'graphile-worker',
  'inngest',
  '@trigger.dev/sdk',
  '@temporalio/client',
  '@temporalio/worker',
  'quirrel',
  'croner',
];

const QUEUE_PY_DEPS = [
  'celery',
  'apscheduler',
  'rq',
  'dramatiq',
  'huey',
  'arq',
  'prefect',
  'apache-airflow',
  'django-q',
];

/**
 * A job being defined. Each of these is a call or a decorator, so none of them match
 * the word appearing in prose or in an unrelated identifier.
 *
 * `new Worker(` is deliberately absent: the browser spells a Web Worker exactly that
 * way, and a Web Worker is not a background job. Where a queue library is in use, its
 * dependency has already answered the question.
 */
const JOB_DECLARATIONS = [
  /new\s+Queue\s*\(/,
  /createQueue\s*\(/,
  /cron\.schedule\s*\(/,
  /CronJob\s*\(/,
  /@shared_task\b/,
  /@(?:celery|app)\.task\b/,
  /@periodic_task\b/,
  /defineJob\s*\(/,
  /\bschedule\.every\s*\(/,
  /add_periodic_task\s*\(/,
];

/**
 * A long-running process declared outside the code.
 *
 * Not every background worker uses a library. Ours does not: it polls Postgres with
 * FOR UPDATE SKIP LOCKED and has no queue dependency and no decorator to find. What it
 * does have — what any shipped worker has — is somewhere that says a second process
 * exists: a script that starts it, and a service that runs it. Those are declarations
 * too, and structural ones.
 *
 * Requiring the library was a false negative on this product's own repository, which
 * is a good sign a rule is wrong.
 */
const PROCESS_NAME = /^(worker|jobs?|queue|scheduler|cron|consumer)(:|-|_|$)/i;

/** Files whose name says they hold out-of-request work. */
const WORKER_FILE = /(^|\/)(workers?|jobs|queues?|tasks)(\/|\.[cm]?[jt]sx?$|\.py$)/i;

export async function detectJobs(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const nodeDeps = hasAnyDep(ctx, QUEUE_DEPS);
  const pyDeps = hasAnyPyDep(ctx, QUEUE_PY_DEPS);
  for (const dep of [...nodeDeps, ...pyDeps]) evidence.push({ type: 'dependency', value: dep });

  const workerFiles = ctx.files.all.filter((file) => WORKER_FILE.test(file)).slice(0, 20);
  for (const file of workerFiles) evidence.push({ type: 'file', value: file, file });

  // A script that starts a separate process.
  const scripts = ctx.packageJson?.scripts ?? {};
  const processScripts = Object.keys(scripts).filter(
    (name) => PROCESS_NAME.test(name) || /(^|\/)workers?\//i.test(String(scripts[name] ?? ''))
  );
  for (const name of processScripts) {
    evidence.push({ type: 'note', value: `package.json script "${name}" starts a separate process` });
  }

  // A compose service that runs one.
  const composeFile = ctx.files.all.find((file) =>
    /(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/.test(file)
  );
  const composeText = composeFile ? ((await readTextFileSafe(ctx.root, composeFile)) ?? '') : '';
  const composeWorker = /^\s{2}(worker|jobs?|scheduler|cron|consumer)[a-z0-9_-]*:/im.test(composeText);

  if (composeWorker && composeFile) {
    evidence.push({ type: 'file', value: 'a worker service in compose', file: composeFile });
  }

  const declarations = await searchInFiles(ctx.root, ctx.files.source, JOB_DECLARATIONS, 20);
  for (const hit of declarations) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  // Collected for the reader, never to decide. A report that says "background jobs
  // detected" and shows only a variable called `queue` has told the reader nothing
  // they can act on.
  const mentions = await searchInFiles(ctx.root, ctx.files.source, [/\bqueue\b/i, /\bworker\b/i, /\bcron\b/i], 10);
  for (const hit of mentions) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  const declared =
    nodeDeps.length > 0
    || pyDeps.length > 0
    || declarations.length > 0
    || processScripts.length > 0
    || composeWorker;

  return {
    key: 'jobs.background',
    // A file named `workers/` is only taken as proof alongside something declared in
    // the code: the name is a convention, and conventions are borrowed.
    present: declared,
    evidence,
    details: {
      nodeQueue: nodeDeps.length > 0,
      pythonQueue: pyDeps.length > 0,
      workerFiles: workerFiles.length,
      declarations: declarations.length,
      processScripts: processScripts.length,
      composeWorker,
    },
  };
}

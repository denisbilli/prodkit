import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { evidenceOrSearch } from './absenceEvidence';

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
  /**
   * A row claimed so that no other worker takes it.
   *
   * `open-webui/open-webui` runs automations and chat timers from a scheduler loop that
   * claims due rows — `select(...).with_for_update(skip_locked=True)`, marks them
   * running, and executes them — with no queue package, no decorator and no worker in
   * compose. Its own lifespan starts the loop, so the process is the web server. It was
   * reported as having no background work at all.
   *
   * `SKIP LOCKED` is the database's, not the author's, and it has one use: several
   * consumers taking rows from the same table without taking the same row. That is a
   * queue, however it is named. The SQL clause, and the spelling each ORM gives it —
   * SQLAlchemy's and Django's `skip_locked=True`, knex's `.skipLocked()`, ent's and
   * GORM's `SkipLocked`.
   */
  /FOR\s+UPDATE\s+SKIP\s+LOCKED/i,
  /\bskip_locked\s*=\s*True\b/,
  /\.skipLocked\s*\(/,
  /\bSkipLocked\b/,
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

  /**
   * A compose service that runs one — in any of the compose files, not the first.
   *
   * A repository has several, and this read whichever came back first: a worker
   * declared in the production compose was invisible whenever a development one
   * sorted ahead of it. The same first-match reading that made `docker.presence`
   * answer "how does this ship" with a devcontainer, one detector along.
   */
  const composeFiles = ctx.files.all.filter((file) =>
    /(^|\/)(docker-compose[\w.-]*\.ya?ml|compose[\w.-]*\.ya?ml)$/.test(file)
  ).slice(0, 8);
  let composeWorker = false;

  for (const composeFile of composeFiles) {
    const composeText = (await readTextFileSafe(ctx.root, composeFile)) ?? '';
    if (!/^\s{2}(worker|jobs?|scheduler|cron|consumer)[a-z0-9_-]*:/im.test(composeText)) continue;

    composeWorker = true;
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
    evidence: evidenceOrSearch(evidence, 'work that happens outside a request', ['bullmq', 'bull', 'agenda', 'bee-queue', 'celery', 'rq', 'sidekiq', 'resque', 'graphile-worker', 'a cron schedule', 'a worker entrypoint']),
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

import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

/**
 * Whether a crash reaches the people who can fix it.
 *
 * On a server a crash is in the logs whether anyone planned for it or not. In code
 * running on someone else's device it is not: the screen goes white, the person closes
 * the tab, and nothing anywhere records that it happened. The bug is invisible until
 * somebody complains, and most people do not complain.
 *
 * That asymmetry is why this is a capability of its own for an application that runs in
 * a browser, and only a nicety for one that does not.
 */

const REPORTER_DEPS = [
  '@sentry/browser',
  '@sentry/react',
  '@sentry/nextjs',
  '@sentry/vue',
  '@sentry/node',
  '@bugsnag/js',
  'rollbar',
  '@highlight-run/react',
  'logrocket',
  '@datadog/browser-rum',
  'trackjs',
];

const REPORTER_PY_DEPS = ['sentry-sdk', 'rollbar', 'bugsnag'];

export async function detectErrorReporting(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const deps = [...hasAnyDep(ctx, REPORTER_DEPS), ...hasAnyPyDep(ctx, REPORTER_PY_DEPS)];
  for (const dep of deps) evidence.push({ type: 'dependency', value: dep });

  /**
   * Hand-rolled reporting. A boundary that renders a message and tells nobody is not
   * reporting, so a React error boundary alone is not counted — what counts is a global
   * handler or a boundary that sends somewhere.
   */
  const handlers = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /window\.addEventListener\s*\(\s*['"]error['"]/,
      /window\.addEventListener\s*\(\s*['"]unhandledrejection['"]/,
      /window\.onerror\s*=/,
      /componentDidCatch\s*\([^)]*\)\s*\{[^}]*(fetch|report|log)/s,
    ],
    10
  );
  for (const hit of handlers) {
    evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
  }

  return {
    key: 'observability.errorReporting',
    present: deps.length > 0 || handlers.length > 0,
    // A reporting service is wired up once and covers everything; a hand-rolled handler
    // usually covers what its author remembered.
    complete: deps.length > 0,
    evidence,
    details: { services: deps, handlers: handlers.length },
  };
}

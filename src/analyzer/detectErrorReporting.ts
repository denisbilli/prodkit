import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDartDep, hasAnyDep, hasAnyGradleDep, hasAnyPyDep, hasAnySwiftDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { evidenceOrSearch } from './absenceEvidence';

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

/**
 * The same capability, in the ecosystems where the browser does not exist.
 *
 * This detector was written for code running in a tab and then made `required` for the
 * mobile-app profile, where none of what it reads can occur: an iOS application has no
 * `window.onerror` and no npm dependency. Three real repositories measured — DuckDuckGo
 * iOS, thunderbird-android, WordPress-iOS — and all three were told at `high` that a
 * crash on someone's phone reaches nobody. A check whose answer cannot vary is not a
 * measure.
 *
 * Coordinates rather than words, matched as substrings by the helpers: `io.sentry` also
 * covers `io.sentry:sentry-android`, and `sentry-cocoa` is how SPM names the package
 * whatever the product is called.
 */
const REPORTER_GRADLE_DEPS = [
  'io.sentry',
  'com.google.firebase:firebase-crashlytics',
  'com.bugsnag',
  'com.microsoft.appcenter:appcenter-crashes',
  'ch.acra:acra',
  'io.embrace',
  'com.datadoghq:dd-sdk-android',
  'com.instabug',
];

const REPORTER_SWIFT_DEPS = [
  'sentry-cocoa',
  'sentry-cocoa-spm',
  'firebase-ios-sdk',
  'firebasecrashlytics',
  'bugsnag-cocoa',
  'appcenter-sdk-apple',
  'instabug',
  'embrace-apple-sdk',
];

const REPORTER_DART_DEPS = ['sentry_flutter', 'firebase_crashlytics', 'bugsnag_flutter'];

/**
 * Handlers the platform defines, which no author names.
 *
 * `NSSetUncaughtExceptionHandler` is Foundation, `Thread.setDefaultUncaughtExceptionHandler`
 * is the JVM, `FlutterError.onError` is Flutter. Each is the one place its platform
 * lets a program learn that it is about to die, so a call to it is the capability
 * itself rather than a word that tends to accompany it — thunderbird-android installs
 * one and was reported as having nothing.
 *
 * `SentrySDK.start` and `FirebaseCrashlytics` are here as well as in the dependency
 * lists: a repository can use a reporter whose manifest is in another repository, and
 * the call is still a call.
 */
const PLATFORM_CRASH_HANDLERS = [
  /NSSetUncaughtExceptionHandler\s*\(/,
  // `(` or `{`: Kotlin writes the handler as a trailing lambda, which is how both real
  // Android applications measured install theirs.
  /setDefaultUncaughtExceptionHandler\s*[({]/,
  /FlutterError\s*\.\s*onError\s*=/,
  /PlatformDispatcher\s*\.\s*instance\s*\.\s*onError\s*=/,
  /SentrySDK\s*\.\s*start\s*\(/,
  /Sentry\s*\.\s*init\s*\(/,
  /FirebaseCrashlytics|Crashlytics\s*\.\s*crashlytics\s*\(/,
];

export async function detectErrorReporting(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const deps = [
    ...hasAnyDep(ctx, REPORTER_DEPS),
    ...hasAnyPyDep(ctx, REPORTER_PY_DEPS),
    ...hasAnyGradleDep(ctx, REPORTER_GRADLE_DEPS),
    ...hasAnySwiftDep(ctx, REPORTER_SWIFT_DEPS),
    ...hasAnyDartDep(ctx, REPORTER_DART_DEPS),
  ];
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
      ...PLATFORM_CRASH_HANDLERS,
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
    evidence: evidenceOrSearch(evidence, 'somewhere a crash in the browser is sent', ['@sentry/browser', '@sentry/react', '@bugsnag/js', 'rollbar', 'logrocket', '@datadog/browser-rum', 'sentry-sdk', 'window.onerror', 'addEventListener("error")', 'addEventListener("unhandledrejection")', 'NSSetUncaughtExceptionHandler', 'Thread.setDefaultUncaughtExceptionHandler', 'FlutterError.onError', 'sentry-cocoa', 'io.sentry', 'firebase-crashlytics']),
    details: { services: deps, handlers: handlers.length },
  };
}

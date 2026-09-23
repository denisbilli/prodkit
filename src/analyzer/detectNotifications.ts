import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyGradleDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { evidenceOrSearch } from './absenceEvidence';

/**
 * Signals for the two things a consumer product needs that a backend service does not:
 * a way to bring a stranger from signup to first use, and a way to reach them
 * afterwards.
 *
 * As with the marketplace detectors, matching is restricted to files where these
 * concepts would be declared. "welcome" and "notification" are common enough words
 * that searching the whole tree reports every project as having onboarding.
 */

const DOMAIN_FILE = /(model|schema|entity|migration|prisma|domain|route|controller|service|job|worker|email|mail|notification)/i;

function domainFiles(ctx: DetectContext): string[] {
  return ctx.files.source.filter((file) => DOMAIN_FILE.test(file));
}

const EMAIL_DEPS = [
  'nodemailer',
  '@sendgrid/mail',
  'resend',
  'postmark',
  'mailgun.js',
  '@aws-sdk/client-ses',
  'react-email',
  '@react-email/components',
];

const PUSH_DEPS = ['firebase-admin', 'web-push', '@onesignal/node-onesignal', 'expo-server-sdk'];
const EMAIL_PY_DEPS = ['sendgrid', 'postmarker', 'mailgun', 'boto3', 'django-anymail'];

/**
 * The JVM's, by coordinate.
 *
 * `traccar/traccar` notifies by email, SMS, Firebase, Telegram and six other channels —
 * `com.sun.mail:jakarta.mail` and `com.google.firebase:firebase-admin` in its build.gradle —
 * and was told it has no way to reach a user, because the two lists above are npm's and
 * PyPI's. Jakarta Mail under its three coordinates, Spring's mail starter, and Firebase's
 * Admin SDK, which is the same package the npm list already names.
 */
const EMAIL_JVM_DEPS = [
  'com.sun.mail:jakarta.mail',
  'com.sun.mail:javax.mail',
  'org.eclipse.angus:angus-mail',
  'org.springframework.boot:spring-boot-starter-mail',
];
const PUSH_JVM_DEPS = ['com.google.firebase:firebase-admin'];

async function detectNotifications(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const emailDeps = [...hasAnyDep(ctx, EMAIL_DEPS), ...hasAnyPyDep(ctx, EMAIL_PY_DEPS), ...hasAnyGradleDep(ctx, EMAIL_JVM_DEPS)];
  const pushDeps = [...hasAnyDep(ctx, PUSH_DEPS), ...hasAnyGradleDep(ctx, PUSH_JVM_DEPS)];
  for (const dep of [...emailDeps, ...pushDeps]) evidence.push({ type: 'dependency', value: dep });

  const hits = await searchInFiles(
    ctx.root,
    domainFiles(ctx),
    [/send_?mail/i, /send_?email/i, /\btransactional\b/i, /push_?notification/i, /\bnotify\(/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  const templateFiles = ctx.files.all
    .filter((file) => /(email|mail)[-_/]?(template|layout)/i.test(file))
    .slice(0, 20);
  for (const file of templateFiles) evidence.push({ type: 'file', value: file });

  // A delivery dependency on its own only proves the capability could exist; the send
  // sites are what show it is wired up.
  const wired = hits.length > 0 || templateFiles.length > 0;
  const capable = emailDeps.length + pushDeps.length > 0;

  return {
    key: 'notifications.transactional',
    present: capable || wired,
    complete: capable && wired,
    evidence: evidenceOrSearch(evidence, 'a way to tell a user something happened', ['nodemailer', 'resend', '@sendgrid/mail', 'postmark', 'mailgun', 'django.core.mail', 'sendMail(', 'send_mail(', 'firebase-admin messaging', 'an email template file']),
    details: {
      emailDependency: emailDeps.length > 0,
      pushDependency: pushDeps.length > 0,
      sendSites: hits.length,
      templateFiles: templateFiles.length,
    },
  };
}

async function detectOnboarding(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const hits = await searchInFiles(
    ctx.root,
    domainFiles(ctx),
    [/\bonboarding\b/i, /\bsign_?up\b/i, /\bregister(ed)?\b/i, /\bwelcome\b/i, /\bfirst_?run\b/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  const files = ctx.files.all.filter((file) => /(onboarding|signup|sign-up|register)/i.test(file)).slice(0, 20);
  for (const file of files) evidence.push({ type: 'file', value: file });

  const strong = files.length > 0;

  return {
    key: 'onboarding.flow',
    present: strong || hits.length > 0,
    complete: strong,
    evidence: evidenceOrSearch(evidence, 'anything that takes a new user through a first run', ['onboarding', 'getting-started', 'welcome', 'firstRun', 'setup wizard', 'a file named for onboarding']),
    details: { onboardingFiles: files.length, onboardingSignals: hits.length },
  };
}

export async function detectEngagement(ctx: DetectContext): Promise<DetectorResult[]> {
  return Promise.all([detectNotifications(ctx), detectOnboarding(ctx)]);
}

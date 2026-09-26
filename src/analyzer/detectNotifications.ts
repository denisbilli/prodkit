import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyGoDep, hasAnyGradleDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';
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
const EMAIL_PY_DEPS = ['sendgrid', 'postmarker', 'mailgun', 'django-anymail', 'django-ses'];

/**
 * boto3 is all of AWS, and email is one service in it.
 *
 * babybuddy depends on boto3 to keep uploaded pictures in S3, sends nothing, and was
 * credited with the means to notify its users. The SDK sends mail only through an SES
 * client, so boto3 counts where one is opened: `boto3.client("ses")` or `"sesv2"`.
 */
async function sendsThroughSes(ctx: DetectContext): Promise<string[]> {
  if (!hasAnyPyDep(ctx, ['boto3']).length) return [];
  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source.filter((file) => file.endsWith('.py')),
    [/\.client\(\s*["']sesv?2?["']/],
    1,
  );
  return hits.length > 0 ? ['boto3'] : [];
}

/**
 * Django sends mail itself.
 *
 * `django.core.mail` is the framework's own — `send_mail`, `EmailMessage`,
 * `get_connection` — and needs no package beside Django. saleor's email plugins import it,
 * and saleor's capability to reach a user rested on boto3 standing in for it; the absence
 * message already said `django.core.mail` was searched for, and nothing searched.
 */
async function djangoSendsMail(ctx: DetectContext): Promise<string[]> {
  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source.filter((file) => file.endsWith('.py')),
    [/^\s*(?:from\s+django\.core\.mail\s+import|import\s+django\.core\.mail)\b/],
    1,
  );
  return hits.length > 0 ? ['django.core.mail'] : [];
}

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
/**
 * Go's, by module path. writefreely sends its password resets and subscription notices
 * through `github.com/mailgun/mailgun-go` and `go-simple-mail`, and was told at `high`
 * that it has no way to reach a user: the lists above were npm, Python and the JVM.
 */
const EMAIL_GO_DEPS = [
  'github.com/mailgun/mailgun-go',
  'github.com/mailgun/mailgun-go/v4',
  'github.com/xhit/go-simple-mail/v2',
  'gopkg.in/gomail.v2',
  'github.com/wneessen/go-mail',
  'github.com/sendgrid/sendgrid-go',
];

async function detectNotifications(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const emailDeps = [...hasAnyDep(ctx, EMAIL_DEPS), ...hasAnyPyDep(ctx, EMAIL_PY_DEPS), ...await sendsThroughSes(ctx), ...await djangoSendsMail(ctx), ...hasAnyGradleDep(ctx, EMAIL_JVM_DEPS), ...hasAnyGoDep(ctx, EMAIL_GO_DEPS)];
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

/**
 * The browser's register, not the user's.
 *
 * Create React App generates `serviceWorkerRegistration.ts` (and before it
 * `registerServiceWorker.js`, and vite-plugin-pwa `registerSW.js`), whose `export function register(config)` hands the app's
 * service worker to `navigator.serviceWorker.register`. photoview has no sign-up at all —
 * an administrator creates its users — and that boilerplate was its onboarding. The API is
 * the Web platform's; a file that calls it is installing a worker, whatever it is named.
 */
async function registersAServiceWorker(ctx: DetectContext, file: string): Promise<boolean> {
  const text = await readTextFileSafe(ctx.root, file);
  return !!text && /\bnavigator\.serviceWorker\b/.test(text);
}

async function detectOnboarding(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];

  const candidates = domainFiles(ctx);
  const namedFiles = ctx.files.all.filter((file) => /(onboarding|signup|sign-up|register)/i.test(file));
  const serviceWorkerFiles = new Set<string>();
  for (const file of [...new Set([...candidates, ...namedFiles])].filter((f) => /\.[cm]?[jt]sx?$/.test(f))) {
    if (await registersAServiceWorker(ctx, file)) serviceWorkerFiles.add(file);
  }

  const hits = await searchInFiles(
    ctx.root,
    candidates.filter((file) => !serviceWorkerFiles.has(file)),
    [/\bonboarding\b/i, /\bsign_?up\b/i, /\bregister(ed)?\b/i, /\bwelcome\b/i, /\bfirst_?run\b/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  const files = namedFiles.filter((file) => !serviceWorkerFiles.has(file)).slice(0, 20);
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

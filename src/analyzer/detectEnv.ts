import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readLookupTableLines } from './structural/lookupTables';
import { anyFileReachesASecretSink, readHardcodedSecretArguments } from './structural/secretArguments';
import { wentUnasked } from './readingDepth';
import { looksLikeDjangoSettings, settingsModulesTheAppRuns } from './djangoSettings';

const WEAK_SECRET_VALUE_RE =
  /(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)/i;

const FALLBACK_SECRET_RE =
  /(jwt_secret|secret_key|session_secret)\s*[:=]\s*['"][^'"]*(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)[^'"]*['"]/i;

const ENV_FALLBACK_RE =
  /(process\.env\.(JWT_SECRET|SECRET_KEY|SESSION_SECRET)\s*(\|\||\?\?)\s*['"][^'"]*(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)[^'"]*['"])/i;

/**
 * The identifier being assigned has to be a secret. Belt and braces with the anchored
 * patterns above: a future pattern added to that list cannot reintroduce the problem
 * of a snippet qualifying on the word "secret" appearing anywhere in it.
 */
const SECRET_ASSIGNMENT_CONTEXT_RE =
  /(JWT_SECRET|SECRET_KEY|SESSION_SECRET|API_KEY|jwt_secret|secret_key|session_secret|api_key)\s*[:=]|process\.env\.[A-Z0-9_]*(SECRET|API_KEY)/;

const GENERIC_SECRET_ASSIGNMENT_RE = /(JWT_SECRET|SECRET_KEY|SESSION_SECRET|API_KEY)\s*[:=]\s*['"][^'"]+['"]/i;

/**
 * A value that exists to hide a secret, not to be one.
 *
 * `config.global_settings.jwt_secret = "***"` is windmill's own redaction, in the
 * command that prints an instance's settings, and it was reported as a hardcoded
 * secret. The weak-value test runs on the whole line, and the line says "secret"
 * because the identifier does — so the value itself was never looked at.
 */
const REDACTED_VALUE_RE = /[:=]\s*['"`](\*{2,}|x{3,}|<?\[?redacted\]?>?|hidden|\.{3,})['"`]/i;

function classifySecretFallback(snippet: string): 'jwt' | 'session' | 'app' | 'apiKey' | 'unknown' {
  if (/JWT_SECRET/i.test(snippet)) return 'jwt';
  if (/SESSION_SECRET/i.test(snippet)) return 'session';
  if (/SECRET_KEY/i.test(snippet)) return 'app';
  if (/API_KEY/i.test(snippet)) return 'apiKey';
  return 'unknown';
}


/**
 * A value that is its own name is a name, not a secret.
 *
 * cal.com declares `export const X_CAL_SECRET_KEY = "x-cal-secret-key"` — the name of
 * an HTTP header, spelled in kebab-case beside the constant that holds it — and it was
 * reported as a hardcoded secret with the severity that bars a report from the top
 * band. The same shape appears wherever a library names a field: `SECRET_KEY =
 * 'AWS_SECRET_ACCESS_KEY'` in botocore is the name of an environment variable.
 *
 * Compared with the punctuation and case stripped, because the whole trick is that the
 * two differ only in spelling: `X_CAL_SECRET_KEY` and `x-cal-secret-key` are the same
 * eleven letters. Nothing else is excused — a real secret does not happen to equal the
 * identifier it is assigned to.
 */
function namesItself(snippet: string): boolean {
  const assignment = /([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*["'`]([^"'`]+)["'`]/.exec(snippet);
  if (!assignment) return false;

  const flatten = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  return flatten(assignment[1]) === flatten(assignment[2]);
}

/**
 * The value is the name of something, spelled the way every language spells a name.
 *
 * `REDIS_SECRET_KEY = "SECRET_TOKEN"` in Discourse is the Redis key under which the
 * secret is stored — the comment directly above it says so — and it was reported as a
 * hardcoded secret at `critical`, the severity that bars a report from the top band.
 * `namesItself` could not catch it: the constant and its value are two different
 * names, so the letters do not match.
 *
 * What settles it is the shape. `SECRET_TOKEN` is SCREAMING_SNAKE_CASE, which is how
 * constants, environment variables and Redis keys are written and not how secrets are
 * written — a secret is entropy, and this has none. Kept to that one casing on
 * purpose: `dev-secret` and `changeme` are lowercase and stay caught.
 */
function valueIsAnIdentifier(snippet: string): boolean {
  const assignment = /([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*["'`]([^"'`]+)["'`]/.exec(snippet);
  if (!assignment) return false;

  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(assignment[2]);
}

export async function detectEnv(ctx: DetectContext): Promise<DetectorResult[]> {
  const evidence: DetectorEvidence[] = [];
  const weakSecretEvidence: DetectorEvidence[] = [];
  const weakSecretByType: Record<'jwt' | 'session' | 'app' | 'apiKey' | 'unknown', DetectorEvidence[]> = {
    jwt: [],
    session: [],
    app: [],
    apiKey: [],
    unknown: [],
  };
  const hasEnvExample = ctx.files.all.includes('.env.example');
  const hasEnv = ctx.files.all.includes('.env');

  if (hasEnvExample) evidence.push({ type: 'file', value: '.env.example' });
  if (hasEnv) evidence.push({ type: 'file', value: '.env' });

  const sourceFiles = ctx.files.source;
  const envReads = await searchInFiles(
    ctx.root,
    sourceFiles,
    [/process\.env\.[A-Z0-9_]+/, /os\.environ\[/, /decouple\.config\(/],
    30
  );
  for (const m of envReads) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  }

  /**
   * Only patterns that name a secret. The list used to include a bare
   * `|| 'anything'` and `?? 'anything'`, which match every nullish default in every
   * codebase and carry no signal about secrets at all. What qualified such a line as
   * weak was WEAK_SECRET_VALUE_RE, and that matches the bare word `secret` — so any
   * line holding a default and the word "secret" anywhere in it was reported.
   *
   * That produced `critical`, the loudest severity there is, and one it caps maturity
   * with. It fired on this very repository, on the string that describes the check;
   * it would fire the same way on an interface label, a translation file, or any
   * application with a "secret question" feature. For a product whose pitch is that
   * every point traces back to a rule and a file you can open, a critical pointing at
   * a sentence about secrets is the worst possible first impression.
   *
   * The three remaining patterns each anchor on a secret-named identifier, which is
   * the thing actually being claimed.
   */
  const fallbackHits = await searchInFiles(
    ctx.root,
    sourceFiles,
    [FALLBACK_SECRET_RE, ENV_FALLBACK_RE, GENERIC_SECRET_ASSIGNMENT_RE],
    30
  );
  /**
   * Entries in a lookup table, which text cannot tell from assignments.
   *
   * `admin_session_secret: 'core'` is one property of a sixty-entry map from settings to
   * the group they belong to, and Ghost was told it was a hardcoded secret. The table is
   * visible only in the shape, so this is one of the places a syntax tree earns its
   * keep. Absent the optional parser the map is null and nothing is excused, which is
   * the behaviour this product had yesterday.
   */
  const lookupTables = await readLookupTableLines(ctx.root, sourceFiles);
  const isTableEntry = (match: { file: string; line: number }): boolean =>
    lookupTables?.get(match.file)?.has(match.line) === true;

  /**
   * The other end of the value, where the library says what it is.
   *
   * Everything above starts from the name being assigned, and the name is the
   * author's: an Italian application signing with `const chiave =
   * process.env.CHIAVE_FIRMA || 'cambiami'` came back `passed`. `jwt.sign(payload,
   * secret)` defines its second argument, and arriving there is what makes a literal
   * a secret whatever it was called on the way.
   */
  const secretArguments = await readHardcodedSecretArguments(ctx.root, sourceFiles);
  for (const hit of secretArguments ?? []) {
    weakSecretEvidence.push({ type: 'snippet', value: `${hit.snippet}  — reaches ${hit.sink}`, file: hit.file, line: hit.line });
    weakSecretByType.unknown.push({ type: 'snippet', value: `${hit.snippet}  — reaches ${hit.sink}`, file: hit.file, line: hit.line });
  }

  /**
   * Whether the sink side of the question went unasked.
   *
   * Only the reader that *finds* secrets counts here. `lookupTables` going missing makes
   * this detector noisier, not blinder, and a noisy finding is one a reader can see and
   * argue with — silence is not.
   */
  const secretSinksUnasked =
    wentUnasked(secretArguments, sourceFiles) && (await anyFileReachesASecretSink(ctx.root, sourceFiles));

  /**
   * A settings module the application does not run is not where its secret lives.
   *
   * pretix keeps `SECRET_KEY = "build-time-secret-key"` in `_build_settings.py`, a
   * module named only by its packaging script, while `manage.py` and `wsgi.py` both
   * name `pretix.settings`. That literal was the one `critical` in its report.
   *
   * Only applied when the entry points say something: with no `manage.py` to read,
   * nothing is excused and the behaviour is what it was.
   */
  const runningSettings = await settingsModulesTheAppRuns(ctx);
  const isAnotherSettingsModule = (file: string): boolean =>
    runningSettings.length > 0 && looksLikeDjangoSettings(file) && !runningSettings.includes(file);

  const weakHits = fallbackHits.filter(
    (m) => WEAK_SECRET_VALUE_RE.test(m.snippet)
      && SECRET_ASSIGNMENT_CONTEXT_RE.test(m.snippet)
      && !namesItself(m.snippet)
      && !valueIsAnIdentifier(m.snippet)
      && !REDACTED_VALUE_RE.test(m.snippet)
      && !isTableEntry(m)
      && !isAnotherSettingsModule(m.file)
  );
  for (const m of weakHits) {
    const hitEvidence = { type: 'snippet', value: m.snippet, file: m.file, line: m.line } as const;
    evidence.push(hitEvidence);
    weakSecretEvidence.push(hitEvidence);
    weakSecretByType[classifySecretFallback(m.snippet)].push(hitEvidence);
  }

  return [
    {
      key: 'env.config',
      present: envReads.length > 0 || hasEnvExample || hasEnv,
      complete: hasEnvExample,
      evidence,
      details: {
        hasEnvExample,
        hasEnv,
        readsEnv: envReads.length > 0,
        missingEnvExampleWarning: envReads.length > 0 && !hasEnvExample,
      },
    },
    {
      key: 'env.secretFallback.jwt',
      present: weakSecretByType.jwt.length > 0,
      unanswered: secretSinksUnasked && weakSecretByType.jwt.length === 0,
      evidence: weakSecretByType.jwt,
    },
    {
      key: 'env.secretFallback.session',
      present: weakSecretByType.session.length > 0,
      unanswered: secretSinksUnasked && weakSecretByType.session.length === 0,
      evidence: weakSecretByType.session,
    },
    {
      key: 'env.secretFallback.app',
      present: weakSecretByType.app.length > 0,
      unanswered: secretSinksUnasked && weakSecretByType.app.length === 0,
      evidence: weakSecretByType.app,
    },
    {
      key: 'env.secretFallback.apiKey',
      present: weakSecretByType.apiKey.length > 0,
      unanswered: secretSinksUnasked && weakSecretByType.apiKey.length === 0,
      evidence: weakSecretByType.apiKey,
    },
    {
      key: 'env.secretFallback.unknown',
      present: weakSecretByType.unknown.length > 0,
      unanswered: secretSinksUnasked && weakSecretByType.unknown.length === 0,
      evidence: weakSecretByType.unknown,
      details: { weakSecretEvidence },
    },
  ];
}

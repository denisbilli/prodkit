import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

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
  const weakHits = fallbackHits.filter(
    (m) => WEAK_SECRET_VALUE_RE.test(m.snippet)
      && SECRET_ASSIGNMENT_CONTEXT_RE.test(m.snippet)
      && !namesItself(m.snippet)
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
      evidence: weakSecretByType.jwt,
    },
    {
      key: 'env.secretFallback.session',
      present: weakSecretByType.session.length > 0,
      evidence: weakSecretByType.session,
    },
    {
      key: 'env.secretFallback.app',
      present: weakSecretByType.app.length > 0,
      evidence: weakSecretByType.app,
    },
    {
      key: 'env.secretFallback.apiKey',
      present: weakSecretByType.apiKey.length > 0,
      evidence: weakSecretByType.apiKey,
    },
    {
      key: 'env.secretFallback.unknown',
      present: weakSecretByType.unknown.length > 0,
      evidence: weakSecretByType.unknown,
      details: { weakSecretEvidence },
    },
  ];
}

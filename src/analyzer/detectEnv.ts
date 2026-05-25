import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

const WEAK_SECRET_VALUE_RE =
  /(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)/i;

const FALLBACK_SECRET_RE =
  /(jwt_secret|secret_key|session_secret)\s*[:=]\s*['\"][^'\"]*(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)[^'\"]*['\"]/i;

const ENV_FALLBACK_RE =
  /(process\.env\.(JWT_SECRET|SECRET_KEY|SESSION_SECRET)\s*(\|\||\?\?)\s*['\"][^'\"]*(changeme|your[_-]?secret|fallback-secret(?:-change-in-production)?|change[_-]in[_-]production|your_jwt_secret_key_change_in_production|local[-_]?secret|development[-_]?secret|dev[-_]?secret|not[_-]?for[_-]?production|test123|secret)[^'\"]*['\"])/i;

const GENERIC_SECRET_ASSIGNMENT_RE = /(JWT_SECRET|SECRET_KEY|SESSION_SECRET|API_KEY)\s*[:=]\s*['\"][^'\"]+['\"]/i;

export async function detectEnv(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
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

  const fallbackHits = await searchInFiles(
    ctx.root,
    sourceFiles,
    [FALLBACK_SECRET_RE, ENV_FALLBACK_RE, /\|\|\s*['\"][^'\"]+['\"]/i, /\?\?\s*['\"][^'\"]+['\"]/i, GENERIC_SECRET_ASSIGNMENT_RE],
    30
  );
  const weakHits = fallbackHits.filter((m) => WEAK_SECRET_VALUE_RE.test(m.snippet));
  for (const m of weakHits) {
    evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  }

  return {
    key: 'env.config',
    present: envReads.length > 0 || hasEnvExample || hasEnv,
    complete: hasEnvExample,
    evidence,
    details: {
      hasEnvExample,
      hasEnv,
      readsEnv: envReads.length > 0,
      missingEnvExampleWarning: envReads.length > 0 && !hasEnvExample,
      weakSecretFallback: weakHits.length > 0,
    },
  };
}

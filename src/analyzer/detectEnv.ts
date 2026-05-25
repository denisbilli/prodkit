import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

const FALLBACK_SECRET_RE =
  /(jwt_secret|secret_key|session_secret)\s*[:=]\s*['\"]?(changeme|your_secret|secret|fallback-secret|change_in_production|dev|test123)['\"]?/i;
const ENV_FALLBACK_RE =
  /(process\.env\.(JWT_SECRET|SECRET_KEY|SESSION_SECRET)\s*\|\|\s*['\"]?(changeme|your_secret|secret|fallback-secret|change_in_production|dev|test123)['\"]?)/i;

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

  const fallbackHits = await searchInFiles(ctx.root, sourceFiles, [FALLBACK_SECRET_RE, ENV_FALLBACK_RE], 10);
  for (const m of fallbackHits) {
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
      weakSecretFallback: fallbackHits.length > 0,
    },
  };
}

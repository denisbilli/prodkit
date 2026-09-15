import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { searchInFiles } from '../utils/textSearch';

interface CorsHit {
  file: string;
  line: number;
  snippet: string;
}

function detectCorsConfig(text: string, file: string): { loose: CorsHit[]; strict: CorsHit[] } {
  const loose: CorsHit[] = [];
  const strict: CorsHit[] = [];
  const lines = text.split(/\r?\n/);
  const corsVarRegex = /\bcors\(\s*([A-Za-z_$][\w$]*)\s*\)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bcors\s*\(/.test(line)) continue;

    const snippet = line.trim().slice(0, 200);
    if (/\bcors\(\s*\)/.test(line)) {
      loose.push({ file, line: i + 1, snippet });
      continue;
    }

    const window = lines.slice(i, Math.min(lines.length, i + 30)).join('\n');
    if (/\borigin\s*:/.test(window)) {
      strict.push({ file, line: i + 1, snippet });
      continue;
    }

    const varMatch = line.match(corsVarRegex);
    if (varMatch) {
      const varName = varMatch[1];
      const varDef = new RegExp(`${varName}\\s*=`, 'i');
      for (let j = 0; j < lines.length; j++) {
        if (!varDef.test(lines[j])) continue;
        const varWindow = lines.slice(j, Math.min(lines.length, j + 30)).join('\n');
        if (/\borigin\s*:/.test(varWindow)) {
          strict.push({ file, line: i + 1, snippet });
          break;
        }
      }
    }
  }

  return { loose, strict };
}

export async function detectSecurity(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const source = ctx.files.source;

  // helmet and express-rate-limit are the Express answers. A framework-native app sets
  // the same headers itself — in a Next proxy, a Nuxt route rule, a Django setting —
  // and looking only for those two packages reported hardened applications as having
  // no protection at all.
  const helmetDep = hasDep(ctx, 'helmet') || hasDep(ctx, 'secure') || hasDep(ctx, 'django-csp');
  const headerSignals = await searchInFiles(
    ctx.root,
    source,
    [
      /Content-Security-Policy/i,
      /Strict-Transport-Security/i,
      /X-Content-Type-Options/i,
      /X-Frame-Options/i,
      /SECURE_HSTS_SECONDS/,
      /securityHeaders/i,
    ],
    20,
  );
  const helmet = helmetDep || headerSignals.length > 0;

  const rateLimitDep =
    hasDep(ctx, 'express-rate-limit') ||
    hasDep(ctx, '@upstash/ratelimit') ||
    hasDep(ctx, 'rate-limiter-flexible') ||
    hasDep(ctx, 'next-rate-limit') ||
    hasDep(ctx, 'django-ratelimit') ||
    hasDep(ctx, 'slowapi');
  const rateLimitSignals = await searchInFiles(
    ctx.root,
    source,
    [/rateLimit\s*\(/, /rate_?limit/i, /Retry-After/i, /\b429\b/, /TooManyRequests/i],
    20,
  );
  const rateLimit = rateLimitDep || rateLimitSignals.length > 0;

  if (helmetDep) evidence.push({ type: 'dependency', value: 'helmet' });
  if (rateLimitDep) evidence.push({ type: 'dependency', value: 'rate limiting package' });
  for (const m of headerSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of rateLimitSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const corsLoose: CorsHit[] = [];
  const corsStrict: CorsHit[] = [];
  for (const file of source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    // Framework-native CORS: an explicit allowlist checked against the Origin header,
    // rather than the Express cors() middleware.
    if (/Access-Control-Allow-Origin/i.test(text) || /ALLOWED_ORIGINS/.test(text) || /allowedOrigins/i.test(text)) {
      const wildcard = /Access-Control-Allow-Origin["'\s:,]+\*/i.test(text);
      const hit = { snippet: 'explicit origin handling', file, line: 1 };
      if (wildcard) corsLoose.push(hit);
      else corsStrict.push(hit);
    }

    if (!/\bcors\s*\(/.test(text)) continue;
    const detected = detectCorsConfig(text, file);
    corsLoose.push(...detected.loose);
    corsStrict.push(...detected.strict);
  }
  for (const m of corsLoose) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of corsStrict) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const webhookSig = await searchInFiles(ctx.root, source, [/constructEvent\(/, /webhook.*signature/i], 10);
  const bodyLimit = await searchInFiles(ctx.root, source, [/express\.json\(\s*\{[^}]*limit\s*:/i], 10);
  const contentTypeCheck = await searchInFiles(ctx.root, source, [/content-type/i, /req\.is\(/], 10);

  for (const m of webhookSig) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of bodyLimit) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
  for (const m of contentTypeCheck) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  const djangoSettings = ctx.files.all.find((f) => f.endsWith('settings.py'));
  let djangoDebugTrue = false;
  let djangoSecureCookies = true;
  if (djangoSettings) {
    const text = (await readTextFileSafe(ctx.root, djangoSettings)) ?? '';
    if (/DEBUG\s*=\s*True/.test(text)) {
      djangoDebugTrue = true;
      evidence.push({ type: 'snippet', value: 'DEBUG = True', file: djangoSettings });
    }
    const insecureSession = /SESSION_COOKIE_SECURE\s*=\s*False/.test(text);
    const insecureCsrf = /CSRF_COOKIE_SECURE\s*=\s*False/.test(text);
    djangoSecureCookies = !(insecureSession || insecureCsrf);
    if (insecureSession) evidence.push({ type: 'snippet', value: 'SESSION_COOKIE_SECURE = False', file: djangoSettings });
    if (insecureCsrf) evidence.push({ type: 'snippet', value: 'CSRF_COOKIE_SECURE = False', file: djangoSettings });
  }

  return {
    key: 'security.core',
    present: helmet || rateLimit || Boolean(djangoSettings),
    complete: helmet && (rateLimit || Boolean(djangoSettings)),
    evidence,
    details: {
      helmet,
      rateLimit,
      corsLoose: corsLoose.length > 0,
      corsStrict: corsStrict.length > 0,
      webhookSignature: webhookSig.length > 0,
      bodySizeLimit: bodyLimit.length > 0,
      contentTypeValidation: contentTypeCheck.length > 0,
      djangoDebugTrue,
      djangoSecureCookies,
    },
  };
}

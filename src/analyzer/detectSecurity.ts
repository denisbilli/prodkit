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

  const helmet = hasDep(ctx, 'helmet');
  const rateLimit = hasDep(ctx, 'express-rate-limit');
  if (helmet) evidence.push({ type: 'dependency', value: 'helmet' });
  if (rateLimit) evidence.push({ type: 'dependency', value: 'express-rate-limit' });

  const corsLoose: CorsHit[] = [];
  const corsStrict: CorsHit[] = [];
  for (const file of source) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text || !/\bcors\s*\(/.test(text)) continue;
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

import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { searchInFiles } from '../utils/textSearch';

export async function detectSecurity(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const source = ctx.files.source;

  const helmet = hasDep(ctx, 'helmet');
  const rateLimit = hasDep(ctx, 'express-rate-limit');
  if (helmet) evidence.push({ type: 'dependency', value: 'helmet' });
  if (rateLimit) evidence.push({ type: 'dependency', value: 'express-rate-limit' });

  const corsLoose = await searchInFiles(ctx.root, source, [/cors\(\s*\)/], 10);
  const corsStrict = await searchInFiles(ctx.root, source, [/cors\(\s*\{[^}]*origin\s*:/i], 10);
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

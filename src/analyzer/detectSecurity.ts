import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasDep } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { isCitableLine, matchLines, searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';
import { isDevelopmentOnlyFile } from './developmentOnly';

/** Lines that decide which origins may call this server. */
const ORIGIN_HANDLING = [/Access-Control-Allow-Origin/i, /ALLOWED_ORIGINS/, /allowedOrigins/i];
/**
 * The same line, allowing everyone.
 *
 * Both spellings, because `'Access-Control-Allow-Origin', '*'` and
 * `ALLOWED_ORIGINS = ["*"]` are the same decision written in two frameworks, and only
 * the first was being caught.
 */
const WILDCARD_ORIGIN = /(Access-Control-Allow-Origin["'\s:,]+\*)|(["']\*["'])/i;

/**
 * Flask's answer, which was invisible.
 *
 * `\bcors\s*\(` is case-sensitive, so `CORS(app)` matched nothing, and the extension's
 * default is to allow every origin — the one configuration this check exists to find.
 * A Flask application that opens itself to the whole web in one line was reported as
 * having no cross-origin configuration at all.
 */
const IMPORTS_FLASK_CORS = /from\s+flask_cors\s+import|import\s+flask_cors/;
const FLASK_CORS_CALL = /\bCORS\s*\(/;

/**
 * The line with its quoted text removed.
 *
 * `cors(` inside a string literal is never the middleware being applied — it is prose
 * about it. This tool's own remediation catalogue, "Replace cors() defaults with an
 * explicit allowlist.", was being cited as a CORS configuration, and no rule about the
 * shape of the line could help: a standalone string in a list is deliberately not
 * skipped, because `'django.contrib.auth',` in INSTALLED_APPS is the behaviour itself.
 *
 * Narrow on purpose. It is applied to this one question, where a call is what is being
 * looked for, and not to the file search, where a string is often the answer.
 */
function withoutStringLiterals(line: string): string {
  return line.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

/** The Express middleware, brought into the file that configures it. */
const IMPORTS_CORS = /(require\(['"]cors['"]\))|(from\s+['"]cors['"])|(import\s+['"]cors['"])/;

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
    if (!isCitableLine(line)) continue;
    if (!/\bcors\s*\(/.test(withoutStringLiterals(line))) continue;

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

/**
 * A settings file that is Django's, rather than one that shares its name.
 *
 * `diet_hub/api/settings.py` is a FastAPI router that lets an administrator change
 * application options from the browser. It was read as Django's configuration, and on
 * the strength of the filename alone the project was credited with having security
 * middleware it does not have — the one direction of error that matters here, because
 * it hides a missing control rather than inventing a present one.
 *
 * Two conditions, because either alone is wrong. A repository can depend on Django and
 * still own a dozen files called settings.py; a file can declare INSTALLED_APPS in a
 * tutorial that the product does not run. And the first file named settings.py is not
 * the right one: a project with `settings/base.py` and `settings/production.py` has
 * several, so every candidate is examined and the first that is Django's is used.
 */
async function findDjangoSettings(ctx: DetectContext): Promise<{ file: string; text: string } | null> {
  if (!ctx.pythonDeps.includes('django')) return null;

  const candidates = ctx.files.all.filter((f) => /(^|\/)settings(_[a-z]+)?\.py$/i.test(f) || /(^|\/)settings\/[a-z_]+\.py$/i.test(f));
  for (const file of candidates) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;
    if (/^\s*INSTALLED_APPS\s*=/m.test(text) || /^\s*MIDDLEWARE\s*=/m.test(text) || /DJANGO_SETTINGS_MODULE/.test(text)) {
      return { file, text };
    }
  }
  return null;
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

  /**
   * Rate limiting where the brute force happens.
   *
   * The rule is titled "Rate limit on auth surfaces" and its own passing sentence says
   * "detected on the authentication surface", and the flag behind both was rate
   * limiting *anywhere*: a limiter on a public feed cleared the check for a sign-in
   * page that has none. Sign-in is the endpoint the limit exists for.
   *
   * The same file, which is as far as this reaches honestly. Where a project splits
   * the limiter from the login the answer becomes "found, not shown to cover sign-in",
   * which is true and which the reader can dismiss in two seconds if they know better.
   *
   * A prefix rule was written for this and removed. TranscribeAI protects its login
   * with `app.use('/api/', limiter)` above `app.use('/api/auth', authRoutes)`, and
   * matching the limiter's mount path against the auth router's looked like the right
   * generalisation — but the mount line says `limiter`, not `rateLimit`, so no rate
   * limit signal is ever on it and the rule never fired on the one case it was written
   * for. Following the variable would work and is a third layer of guessing on top of
   * two; TranscribeAI stays `partial`, which is what this can show.
   */
  const authSurfaceFiles = new Set(
    (await searchInFiles(ctx.root, source, [/['"`]\/(login|signin|sign-in|auth|session)/i, /passport\./, /signIn\s*\(/, /authenticate\s*\(/], 40))
      .map((match) => match.file),
  );
  const rateLimitNearAuth = rateLimitSignals.some((match) => authSurfaceFiles.has(match.file));

  if (helmetDep) evidence.push({ type: 'dependency', value: 'helmet', claim: 'headers' });
  if (rateLimitDep) evidence.push({ type: 'dependency', value: 'rate limiting package', claim: 'rate-limit' });
  for (const m of headerSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'headers' });
  for (const m of rateLimitSignals) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'rate-limit' });

  const corsLoose: CorsHit[] = [];
  const corsStrict: CorsHit[] = [];
  for (const file of source) {
    // Rails picks one environment file by RAILS_ENV, so a header set in
    // development.rb is not a header this product sends.
    if (isDevelopmentOnlyFile(file)) continue;
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    // Framework-native CORS: an explicit allowlist checked against the Origin header,
    // rather than the Express cors() middleware.
    //
    // Line by line, because the file is the wrong unit for this question twice over.
    // It decided loose-or-strict from whether a wildcard appeared anywhere in the
    // file, so one permissive route made an allowlist read as permissive and one
    // allowlist made a wildcard read as restricted; and it cited line 1, which in
    // every repository that triggered it was an import.
    for (const m of matchLines(text, ORIGIN_HANDLING, file)) {
      if (WILDCARD_ORIGIN.test(m.snippet)) corsLoose.push(m);
      else corsStrict.push(m);
    }

    // Only where the middleware is actually imported. A sentence in this tool's own
    // remediation catalogue — "Replace cors() defaults with an explicit allowlist." —
    // was being read as a CORS configuration, and a table of strings is not a comment,
    // so no rule about the shape of the line could tell them apart. Whether the file
    // imports the package can.
    if (IMPORTS_FLASK_CORS.test(text)) {
      const lines = text.split(/\r?\n/);
      for (const m of matchLines(text, [FLASK_CORS_CALL], file).filter((m) => FLASK_CORS_CALL.test(withoutStringLiterals(m.snippet)))) {
        const window = lines.slice(m.line - 1, m.line + 9).join('\n');
        if (/\borigins\s*=/.test(window) || /\bresources\s*=/.test(window)) corsStrict.push(m);
        else corsLoose.push(m);
      }
    }

    if (!IMPORTS_CORS.test(text)) continue;
    if (!/\bcors\s*\(/.test(text)) continue;
    const detected = detectCorsConfig(text, file);
    corsLoose.push(...detected.loose);
    corsStrict.push(...detected.strict);
  }
  for (const m of corsLoose) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'cors' });
  for (const m of corsStrict) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'cors' });

  /**
   * What was looked for, where nothing was found.
   *
   * "No direct evidence captured" reads like "we did not look". These are the same
   * terms the searches above use, so a reader whose rate limiter is a decorator called
   * `@throttle` can see in one line why it was missed, and say so.
   */
  if (!helmet) {
    evidence.push(...searchedFor('security headers', ['helmet', 'django-csp', 'Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'SECURE_HSTS_SECONDS', 'securityHeaders'], 'headers'));
  }
  if (!rateLimit) {
    evidence.push(...searchedFor('rate limiting', ['express-rate-limit', '@upstash/ratelimit', 'rate-limiter-flexible', 'django-ratelimit', 'slowapi', 'rateLimit(', 'rate_limit', 'Retry-After', '429', 'TooManyRequests'], 'rate-limit'));
  }
  if (corsLoose.length === 0 && corsStrict.length === 0) {
    evidence.push(...searchedFor('cross-origin configuration', ['cors(', 'Access-Control-Allow-Origin', 'ALLOWED_ORIGINS', 'allowedOrigins'], 'cors'));
  }

  const webhookSig = await searchInFiles(ctx.root, source, [/constructEvent\(/, /webhook.*signature/i], 10);
  const bodyLimit = await searchInFiles(ctx.root, source, [/express\.json\(\s*\{[^}]*limit\s*:/i], 10);
  const contentTypeCheck = await searchInFiles(ctx.root, source, [/content-type/i, /req\.is\(/], 10);

  for (const m of webhookSig) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'webhook-signature' });
  for (const m of bodyLimit) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'body-size' });
  for (const m of contentTypeCheck) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'content-type' });

  /**
   * Django was credited for headers twice, and neither credit was earned.
   *
   * The first was the mere existence of a file named settings.py, which a FastAPI
   * router satisfied. The second looked truer — `SecurityMiddleware` really does set
   * those headers — but `django-admin startproject` writes that line into every new
   * project, so it distinguishes nothing and would have credited the bare skeleton
   * this repository keeps as a fixture precisely because it is unprotected. What is
   * left is the `SECURE_*` settings above: lines somebody chose to write.
   */
  const djangoSettings = await findDjangoSettings(ctx);
  let djangoDebugTrue = false;
  let djangoSecureCookies = true;
  if (djangoSettings) {
    const { file, text } = djangoSettings;
    const debugOn = matchLines(text, [/^\s*DEBUG\s*=\s*True\b/], file);
    if (debugOn.length > 0) {
      djangoDebugTrue = true;
      for (const m of debugOn) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'django-debug' });
    }
    const insecure = matchLines(
      text,
      [/^\s*SESSION_COOKIE_SECURE\s*=\s*False\b/, /^\s*CSRF_COOKIE_SECURE\s*=\s*False\b/],
      file,
    );
    djangoSecureCookies = insecure.length === 0;
    for (const m of insecure) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'django-cookies' });
  }

  return {
    key: 'security.core',
    present: helmet || rateLimit,
    complete: helmet && rateLimit,
    evidence,
    details: {
      helmet,
      rateLimit,
      rateLimitNearAuth,
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

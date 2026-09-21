import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyElixirDep, hasAnyGradleDep, hasAnyPyDep, hasAnyRubyDep, hasAnyRustDep, hasDep } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { findDjangoSettings } from './djangoSettings';
import { isCitableLine, matchLines, searchInFiles } from '../utils/textSearch';
import { searchedFor } from './absenceEvidence';
import { readPackageValueUses } from './structural/valuesFromPackage';
import { wentUnasked } from './readingDepth';
import { isDevelopmentOnlyFile } from './developmentOnly';

/** Lines that decide which origins may call this server. */
const ORIGIN_HANDLING = [/Access-Control-Allow-Origin/i, /ALLOWED_ORIGINS/, /allowedOrigins/i];

/** The cloud SDKs' names for a bucket's own cross-origin rules. */
const CLOUD_STORAGE_CORS = /\bStorageCorsRule\b|\bCorsRules\b|\bCORSRule\b|\bCORSConfiguration\b|\bsetCorsConfiguration\b/;

/**
 * Whether this line sits inside one of those rules.
 *
 * The type is named where the object is opened and the origins are listed a few lines
 * further in — bitwarden's `CorsRules.Add(new StorageCorsRule` is two lines above its
 * `AllowedOrigins`. A short window rather than the whole file, because the names are
 * specific enough to be decisive and a file-wide test would excuse a real policy that
 * happens to share a file with a bucket's.
 */
const CLOUD_STORAGE_CORS_WINDOW = 5;

function namesACloudStorageRule(text: string, line: number): boolean {
  const lines = text.split(/\r?\n/);
  const from = Math.max(0, line - 1 - CLOUD_STORAGE_CORS_WINDOW);

  return lines.slice(from, line).some((candidate) => CLOUD_STORAGE_CORS.test(candidate));
}
/**
 * The same line, allowing everyone.
 *
 * Both spellings, because `'Access-Control-Allow-Origin', '*'` and
 * `ALLOWED_ORIGINS = ["*"]` are the same decision written in two frameworks, and only
 * the first was being caught.
 */
/** `== StatusCode::TOO_MANY_REQUESTS` and its spellings: a status being read. */
const COMPARES_A_STATUS = /[=!]==?\s*(?:StatusCode::TOO_MANY_REQUESTS|http\.StatusTooManyRequests|HttpStatus\.TOO_MANY_REQUESTS|HttpStatusCode\.TooManyRequests|Status429TooManyRequests)|(?:StatusCode::TOO_MANY_REQUESTS|http\.StatusTooManyRequests|HttpStatus\.TOO_MANY_REQUESTS|HttpStatusCode\.TooManyRequests)\s*[=!]==?/;

const WILDCARD_ORIGIN = /(Access-Control-Allow-Origin["'\s:,]+\*)|(["']\*["'])/i;

/**
 * A line that names an origin somebody chose.
 *
 * The test is that the value is written down: a quoted string that is not `*`, or a
 * list of them. Everything else — a variable, a concatenation, a method call — is a
 * value the reader of this line cannot see, and a security check does not get to
 * assume it is an allowlist.
 */
function allowsAChosenOrigin(line: string, file: string): boolean {
  /**
   * The line itself asks whether the origin belongs.
   *
   * `!ALLOWED_ORIGINS.includes(origin)` is the allowlist being enforced, and it is
   * the strongest evidence there is — stronger than the declaration it checks
   * against, which may live in an environment variable.
   */
  if (MEMBERSHIP_TEST.test(line)) return true;

  const assigned = /(?:Access-Control-Allow-Origin|ALLOWED_ORIGINS|allowedOrigins)[^=:,]*[=:,]\s*(.+)$/i.exec(line);
  if (!assigned) return false;

  // An origin written down: it has a scheme or a dotted host, which `","` does not.
  if (/["'`](?:https?:\/\/|\*\.)[^"'`]*["'`]|["'`][^"'`]*\.[a-z]{2,}[^"'`]*["'`]/i.test(assigned[1])) return true;

  /**
   * Or a value this line cannot see, checked somewhere else in the same file.
   *
   * A list kept in an environment variable is still an allowlist, so the test cannot
   * be "is the value a literal". What separates it from reflection is that somebody
   * asks whether the origin belongs before answering yes — and shopizer never does:
   * `origin = request.getHeader("origin")` goes straight into the header.
   */
  return MEMBERSHIP_TEST.test(file);
}

/** `includes`, `contains`, `indexOf`, `has` — asking whether a value belongs. */
const MEMBERSHIP_TEST = /\.(includes|contains|indexOf|has)\s*\(/i;

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
 * Starlette's, which is how every FastAPI application does it.
 *
 * The full-stack FastAPI template — the one the framework's own organisation
 * publishes — was told at `high` to add cross-origin handling, above
 * `app.add_middleware(CORSMiddleware, allow_origins=[settings.FRONTEND_HOST])`. The
 * class comes from the framework and `add_middleware` is its contract; neither is a
 * word the author picked.
 *
 * The allowlist decides which case it is, read from the same call: `allow_origins`
 * holding a bare `"*"` is the wide-open one, and anything else is a list somebody
 * chose.
 */
const IMPORTS_STARLETTE_CORS = /from\s+(?:starlette|fastapi)\.middleware(?:\.cors)?\s+import[^\n]*CORSMiddleware/;
const STARLETTE_CORS_CALL = /add_middleware\s*\(\s*\n?\s*CORSMiddleware/;

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

/**
 * The middleware, under whatever name it was given.
 *
 * `cors(` is the name of the export, and an author is free not to use it:
 * `const apriTutto = require('cors'); app.use(apriTutto());` is a wide-open policy
 * that came back as "CORS configuration not detected" — a real hole reported as the
 * absence of a question. The package is the anchor; the names come from the binding
 * and are recognised here rather than guessed.
 */
function detectCorsConfig(
  text: string,
  file: string,
  boundNames: ReadonlySet<string>,
): { loose: CorsHit[]; strict: CorsHit[] } {
  const loose: CorsHit[] = [];
  const strict: CorsHit[] = [];
  const lines = text.split(/\r?\n/);
  const names = [...new Set(['cors', ...boundNames])].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const anyName = names.join('|');
  const callRegex = new RegExp(`\\b(?:${anyName})\\s*\\(`);
  const bareCallRegex = new RegExp(`\\b(?:${anyName})\\(\\s*\\)`);
  const corsVarRegex = new RegExp(`\\b(?:${anyName})\\(\\s*([A-Za-z_$][\\w$]*)\\s*\\)`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isCitableLine(line)) continue;
    if (!callRegex.test(withoutStringLiterals(line))) continue;

    const snippet = line.trim().slice(0, 200);
    if (bareCallRegex.test(line)) {
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


const RATE_LIMIT_PACKAGES = [
  'express-rate-limit',
  '@upstash/ratelimit',
  'rate-limiter-flexible',
  'next-rate-limit',
  'express-slow-down',
  'koa-ratelimit',
  'fastify-rate-limit',
  '@fastify/rate-limit',
];

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
      /**
       * Django's spelling of the same decisions.
       *
       * The list held the HTTP header names and one Django setting, so a project that
       * writes `X_FRAME_OPTIONS = "SAMEORIGIN"` — the setting, with underscores, which
       * is the only way to say it in Django — matched nothing. paperless-ngx sets it
       * and was told at `high` to add security headers.
       *
       * Only the settings that choose a policy. `SECURE_PROXY_SSL_HEADER` is not one
       * of them: it tells Django how to tell it is behind HTTPS, and every deployment
       * behind a proxy needs it whether or not anybody thought about headers. And
       * `SecurityMiddleware` itself stays out, for the reason recorded further down —
       * `django-admin startproject` writes it into every new project.
       */
      /^\s*X_FRAME_OPTIONS\s*=/m,
      /^\s*SECURE_CONTENT_TYPE_NOSNIFF\s*=/m,
      /^\s*SECURE_BROWSER_XSS_FILTER\s*=/m,
      /^\s*SECURE_REFERRER_POLICY\s*=/m,
      /^\s*SECURE_CROSS_ORIGIN_OPENER_POLICY\s*=/m,
      /^\s*CSP_DEFAULT_SRC\s*=/m,
      /**
       * Rails writes its header policy as Ruby, not as a header name.
       *
       * `config.content_security_policy do |policy|` in an initializer is the policy
       * itself, and `config.force_ssl = true` is what turns on Strict-Transport-Security
       * for the whole application. lobsters has both and was told at `high` to add
       * security headers.
       *
       * Both are lines somebody chose to write. Rails' *default* headers —
       * `X-Frame-Options: SAMEORIGIN`, nosniff, and the rest of `DefaultHeaders` —
       * are not counted, for the reason Django's `SecurityMiddleware` is not: every
       * application has them, so they distinguish nothing.
       */
      /config\.content_security_policy\b/,
      /^\s*config\.force_ssl\s*=\s*true/m,
    ],
    20,
  );
  /**
   * Reading a header is not setting one.
   *
   * plausible ships `tracker/installation_support/check-disallowed-by-csp.js`, whose
   * whole job is to look at somebody else's `content-security-policy` and tell a user
   * why the tracker was blocked. Its line `responseHeaders?.['content-security-policy']`
   * was the evidence behind "security headers: passed" — a tool that inspects other
   * people's headers credited with setting its own.
   *
   * The shape is the anchor, not the file: a header name used as a key into a headers
   * object is a lookup. Setting one is a call — `put_resp_header`, `setHeader`,
   * `headers.set`, `add_header` — or an assignment to that subscript, and a line doing
   * either is left alone.
   */
  const READS_A_HEADER = /\[\s*(['"`])[^'"`]+\1\s*\](?!\s*=[^=])/;
  const SETS_A_HEADER = /put_resp_header|setHeader|set_header|add_header|headers\.(?:set|append)|writeHead/i;
  const headerSignalsThatSet = headerSignals.filter(
    (hit) => !READS_A_HEADER.test(hit.snippet) || SETS_A_HEADER.test(hit.snippet),
  );

  /**
   * Spring Security, which writes the headers without being asked.
   *
   * Adding `spring-boot-starter-security` and configuring an `HttpSecurity` chain
   * gives every response `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
   * and a no-store `Cache-Control` — the framework's defaults, applied whether or not
   * anybody writes a line about headers. shopizer does exactly that and was told it
   * has none.
   *
   * Unlike Django's `SecurityMiddleware`, which is deliberately not counted a few
   * lines down: `django-admin startproject` writes that into every new project, so it
   * distinguishes nothing, and its HSTS and nosniff behaviour still waits on
   * `SECURE_*` settings. This starter is not in every Spring project — petclinic has
   * no security at all — and its defaults need no settings.
   *
   * The chain is what is required. A project can pull the starter for method-level
   * authorization in something that serves no requests, and then there is no filter
   * chain and no headers — which is what the second fixture holds.
   *
   * The dependency check in front of it is a pre-filter and nothing more: it keeps
   * this search off every file of every non-Spring repository. Removing it fails no
   * test, and the comment says so rather than implying a safety it does not provide.
   */
  const springSecurity = hasAnyGradleDep(ctx, ['spring-boot-starter-security', 'spring-security-config']);
  const springFilterChain = springSecurity.length > 0
    ? await searchInFiles(ctx.root, source, [/HttpSecurity\s+\w+|\bhttp\s*\n?\s*\.\s*(?:authorizeHttpRequests|authorizeRequests|securityMatcher|antMatcher)/], 2)
    : [];

  if (springFilterChain.length > 0) {
    for (const dep of springSecurity) evidence.push({ type: 'dependency', value: dep, claim: 'headers' });
    evidence.push({
      type: 'snippet',
      value: springFilterChain[0].snippet,
      file: springFilterChain[0].file,
      line: springFilterChain[0].line,
      claim: 'headers',
    });
  }

  const helmet = helmetDep || headerSignalsThatSet.length > 0 || springFilterChain.length > 0;

  /**
   * The packages the ecosystem names, as distinct from the variables authors do.
   * Shared between the dependency check below and the binding walk further down.
   */
  /**
   * Two of these were checked against the wrong manifest for as long as they existed.
   *
   * `hasDep` reads `package.json` and nothing else, so `django-ratelimit` and
   * `slowapi` — a Python package and a Python package — were being looked for among a
   * project's npm dependencies, where they can never be. Written as though they
   * worked, never able to match.
   *
   * Rust joins them, measured: vaultwarden declares `governor` and calls
   * `check_limit_login(&ip.ip)` on its login route, and was told at `high` that it
   * does not throttle authentication.
   */
  const rateLimitDep =
    hasDep(ctx, 'express-rate-limit') ||
    hasDep(ctx, '@upstash/ratelimit') ||
    hasDep(ctx, 'rate-limiter-flexible') ||
    hasDep(ctx, 'next-rate-limit') ||
    hasAnyPyDep(ctx, ['django-ratelimit', 'slowapi', 'flask-limiter']).length > 0 ||
    hasAnyRustDep(ctx, ['governor', 'tower_governor', 'tower-governor', 'actix-governor', 'ratelimit']).length > 0 ||
    /**
     * Ruby's, which is one gem and nearly universal in Rails.
     *
     * lobsters declares `gem "rack-attack" # rate-limiting` and was told at `high`
     * that it does not throttle. The list had grown npm, Python and Rust entries and
     * skipped the ecosystem where the answer is a single well-known name.
     */
    hasAnyRubyDep(ctx, ['rack-attack', 'rack_attack']).length > 0 ||
    /** Elixir's, which are plugs: `hammer` counts, `plug_attack` and `ex_rated` refuse. */
    hasAnyElixirDep(ctx, ['hammer', 'plug_attack', 'ex_rated', 'pow_ratelimit']).length > 0;
  /**
   * Throttling by what the protocol says, not by what the variable is called.
   *
   * `/rate_?limit/i` matched `rateLimitEnabled: z.boolean().optional()` — a field in
   * a zod schema for a form where dokploy's *users* configure limits on their own API
   * keys. The application has no limiter and no 429 anywhere in its source, and the
   * report said it was throttled. The word was there; the thing was not.
   *
   * `429`, `Retry-After` and `TooManyRequests` stay because nobody chose them: they
   * are what HTTP calls this, and a hand-rolled limiter that writes one of them is
   * really limiting something. The package and its binding cover the rest.
   */
  /**
   * Issuing the refusal, not receiving one.
   *
   * `\b429\b` matched both directions. nocodb's webhook invoker handles a 429 coming
   * back from somebody else's server — that is this project being throttled, the
   * opposite of this project throttling — and it was one of the lines behind "rate
   * limiting is in place somewhere". Its login has no throttle at all: the global
   * guard is an id extractor, and the rest of the matches are migrations, a SQL
   * client and mock fixtures.
   *
   * `res.status(429)` and `throw new TooManyRequestsError` are a server refusing a
   * caller. `if (response.status === 429)` is a client being refused. HTTP names the
   * number; the direction is in the shape around it.
   */
  const rateLimitSignals = await searchInFiles(
    ctx.root,
    source,
    [
      /\.status\(\s*429/,
      /status(?:Code)?\s*[:=]\s*429/,
      /sendStatus\(\s*429/,
      /throw new \w*TooManyRequests/,
      /abort\(\s*429/,
      /HTTPException\(\s*429/,
      /['"`]Retry-After['"`]\s*[,:]/i,
      /setHeader\(\s*['"`]Retry-After/i,
      /**
       * The same refusal, spelled the way each platform spells it.
       *
       * Every shape above is JavaScript or Python, so a service that throttles in any
       * other language had to declare a package to be seen at all. crates.io writes
       * its own limiter — `src/rate_limiter.rs`, no crate — and refuses with
       * `StatusCode::TOO_MANY_REQUESTS`; it was told at `high` that it does not
       * throttle.
       *
       * These are constants the standard library or the framework defines for one
       * number in RFC 6585. Nobody picks the name, and each of them is the server
       * issuing the refusal rather than reading one: a constant is what you construct
       * a response from, where receiving is a comparison against `.status`.
       */
      /**
       * Laravel's, which is a middleware alias the framework registers.
       *
       * `Route::middleware(['throttle:oauth2-socialite'])` is monica applying the
       * limiter that ships with the framework, and `RateLimiter::for('login', ...)`
       * is where the limit is defined. Neither is a package to depend on — the
       * limiter is part of Laravel — so a list of packages could never find them, and
       * monica was told at `high` that it does not throttle.
       */
      /['"]throttle:[\w.-]+['"]/,
      /\bRateLimiter::for\s*\(/,
      /StatusCode::TOO_MANY_REQUESTS/,
      /http\.StatusTooManyRequests/,
      /HttpStatus\.TOO_MANY_REQUESTS/,
      /HttpStatusCode\.TooManyRequests/,
      /Status429TooManyRequests/,
    ],
    20,
  );

  /**
   * Still issuing, not receiving — the constants need the same test the numbers got.
   *
   * `res.status(429)` can only be a server refusing, but
   * `if resp.status() == StatusCode::TOO_MANY_REQUESTS` is this project being
   * refused by somebody else's, which is what nocodb's webhook invoker does. A
   * comparison is the reading direction; an argument is the writing one.
   */
  const issuedRateLimits = rateLimitSignals.filter((hit) => !COMPARES_A_STATUS.test(hit.snippet));
  const rateLimit = rateLimitDep || issuedRateLimits.length > 0;

  /**
   * Rate limiting where the brute force happens.
   *
   * The rule is titled "Rate limit on auth surfaces" and its own passing sentence says
   * "detected on the authentication surface", and the flag behind both was rate
   * limiting *anywhere*: a limiter on a public feed cleared the check for a sign-in
   * page that has none.
   *
   * Finding the limiter by its name is the part that does not hold. `const limiter =
   * rateLimit(...)` is found because somebody wrote "rateLimit"; the same protection
   * written as `const thisIsFuckingTopUse = require('express-rate-limit')` is
   * invisible, and a login that is in fact protected gets downgraded. The name is the
   * one thing its author chose freely, and it is what every search here reads.
   *
   * So the anchor is the package, which the author did not name, and the chain from
   * there is mechanical: the binding the import is assigned to, the values that
   * binding produces when called, and every place those values are used. Where the
   * parser is installed that answers the question outright; where it is not, the text
   * search below is still the floor, which is the same contract every other
   * structural reader here keeps.
   */
  const boundLimiterUses = await readPackageValueUses(ctx.root, source, RATE_LIMIT_PACKAGES);

  const authSurfaceFiles = new Set(
    (await searchInFiles(ctx.root, source, [/['"`]\/(login|signin|sign-in|auth|session)/i, /passport\./, /signIn\s*\(/, /authenticate\s*\(/], 40))
      .map((match) => match.file),
  );
  /**
   * A limiter mounted on a prefix covers what is mounted under it.
   *
   * TranscribeAI writes `app.use('/api/', limiter)` and, seventy lines down,
   * `app.use('/api/auth', authRoutes)`. Its login is protected and a same-file test
   * called it unprotected, because the router lives in another file. Both mount paths
   * are strings in this one, and `/api/auth` says what it carries — so the coverage
   * is readable without following the router anywhere.
   */
  const mountedPaths = (boundLimiterUses ?? [])
    .map((use) => use.mountPath)
    .filter((path): path is string => Boolean(path))
    .map((path) => path.replace(/\/+$/, ''));

  const authMountPaths = (await searchInFiles(ctx.root, source, [/\buse\(\s*['"`]\/[^'"`]*(auth|login|signin|session|account)/i], 20))
    .map((match) => /\buse\(\s*['"`](\/[^'"`]*)['"`]/.exec(match.snippet)?.[1])
    .filter((path): path is string => Boolean(path));

  const coversAnAuthMount = mountedPaths.some((prefix) =>
    authMountPaths.some((mount) => mount === prefix || mount.startsWith(`${prefix}/`)),
  );

  const rateLimitNearAuth =
    coversAnAuthMount
    || (boundLimiterUses ?? []).some((use) => authSurfaceFiles.has(use.file))
    || issuedRateLimits.some((match) => authSurfaceFiles.has(match.file));

  if (helmetDep) evidence.push({ type: 'dependency', value: 'helmet', claim: 'headers' });
  if (rateLimitDep) evidence.push({ type: 'dependency', value: 'rate limiting package', claim: 'rate-limit' });
  for (const m of headerSignalsThatSet) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'headers' });
  for (const m of issuedRateLimits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line, claim: 'rate-limit' });

  /**
   * Every identifier the `cors` package reaches, per file.
   *
   * `const apriTutto = require('cors')` binds the middleware to a name no word list
   * will ever hold, and `app.use(apriTutto())` is a wide-open policy that read as no
   * policy at all. The import is the fact; the name is whatever this author typed.
   */
  const corsBindings = await readPackageValueUses(ctx.root, source, ['cors']);

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
      /**
       * A bucket's CORS is not the application's CORS.
       *
       * bitwarden's Aspire host configures the local Azurite storage emulator with
       * `AllowedOrigins = [new BicepValue<string>("*")]` inside a `StorageCorsRule`,
       * and that one line made a `high` finding out of an API whose actual policy is
       * `SetIsOriginAllowed(o => CoreHelpers.IsCorsOriginAllowed(o, globalSettings))`
       * — a function deciding, cited two lines below it in the same report.
       *
       * The subject is different, not the severity: a storage account, a bucket or a
       * CDN distribution answers for the objects it serves, and this check is about
       * the requests this application answers. `StorageCorsRule`, `CorsRules` and S3's
       * `CORSRule` are type names from the cloud SDKs, so they are the anchor.
       */
      if (namesACloudStorageRule(text, m.line)) continue;
      if (WILDCARD_ORIGIN.test(m.snippet)) corsLoose.push(m);
      else if (allowsAChosenOrigin(m.snippet, text)) corsStrict.push(m);
      /**
       * Anything else sets the header to a value this cannot see.
       *
       * shopizer writes `origin = request.getHeader("origin")` and then
       * `setHeader("Access-Control-Allow-Origin", origin)` — reflecting whatever the
       * caller asked for, which allows every origin there is. The report called it
       * "configured with explicit origins" and passed it: a clean verdict on the one
       * shape this check exists to catch.
       *
       * An allowlist is a fixed set, so it is written down. A variable, a
       * concatenation or a call cannot be shown to be one — it may be a value from
       * configuration, and it may be the request's own header, and nothing in the line
       * says which. `partial` is what that deserves: something is configured and
       * nothing here shows it restricted.
       */
      else corsLoose.push(m);
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

    if (IMPORTS_STARLETTE_CORS.test(text)) {
      const lines = text.split(/\r?\n/);
      const at = lines.findIndex((line) => /add_middleware\s*\(/.test(line) && isCitableLine(line));

      if (at !== -1) {
        const window = lines.slice(at, Math.min(lines.length, at + 12)).join('\n');
        if (STARLETTE_CORS_CALL.test(window)) {
          const hit: CorsHit = { file, line: at + 1, snippet: lines[at].trim().slice(0, 200) };
          const allowList = /allow_origins\s*=\s*\[([^\]]*)\]/.exec(window);

          if (allowList) {
            if (/^\s*["']\*["']\s*,?\s*$/.test(allowList[1])) corsLoose.push(hit);
            else corsStrict.push(hit);
            continue;
          }

          /**
           * `allow_origins=allowed_origins`, which is how a real application writes it.
           *
           * mealie builds the list from its settings and passes the name, and calling
           * that "no explicit origin restrictions" at `high` reads as advice to add
           * the allowlist it has. The wildcard is written literally when it is meant —
           * `allow_origins=["*"]` — so a name is followed to its assignment, and a
           * value assembled somewhere this cannot see is a configuration rather than a
           * wildcard.
           */
          const named = /allow_origins\s*=\s*([A-Za-z_][\w.]*)/.exec(window);
          const assigned = named
            ? new RegExp(`^\\s*${named[1].split('.').pop()}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(text)
            : null;

          if (assigned && /^\s*["']\*["']\s*,?\s*$/.test(assigned[1])) corsLoose.push(hit);
          else corsStrict.push(hit);
        }
      }
    }

    if (!IMPORTS_CORS.test(text)) continue;
    const boundNames = new Set((corsBindings ?? []).filter((use) => use.file === file).map((use) => use.name));
    // `cors(` under its own name, or under the one the binding gave it.
    if (boundNames.size === 0 && !/\bcors\s*\(/.test(text)) continue;
    const detected = detectCorsConfig(text, file, boundNames);
    corsLoose.push(...detected.loose);
    corsStrict.push(...detected.strict);
  }
  /**
   * Django's answer, which is a string in a list.
   *
   * netbox installs `corsheaders.middleware.CorsMiddleware` and was reported as having
   * no cross-origin configuration at all — then told, at `high`, to add the handling it
   * has. Nothing here looked for it: the reading was built around a call expression,
   * and django-cors-headers is applied by naming it in `MIDDLEWARE` and configured by
   * setting names the package itself defines.
   *
   * The package name and its setting names are the anchor, and neither is the author's
   * to choose. Installed with no allowlist the package denies every cross-origin
   * request, so the middleware alone is the strict case; `CORS_ALLOW_ALL_ORIGINS` — and
   * `CORS_ORIGIN_ALLOW_ALL`, which is what it was called before version 3.5 — is the
   * one line that opens it.
   */
  /**
   * Laravel's answer, which is a file with a name the framework chose.
   *
   * `config/cors.php` is published by Laravel and read by its own middleware; a
   * project either has it or does not. Firefly III has one whose `'allowed_origins'`
   * is `['*']`, and the report said it had no cross-origin configuration at all —
   * the worst direction for this check, because a project that opened itself to the
   * whole web read as one that had not thought about it.
   *
   * The path is the anchor and the array is the answer: a bare `'*'` is the wide-open
   * case, and a list of origins is one somebody chose.
   */
  for (const file of source.concat(ctx.files.all).filter((f) => /(^|\/)config\/cors\.php$/.test(f))) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    const origins = /'allowed_origins'\s*=>\s*\[([^\]]*)\]/.exec(text);
    const line = origins ? text.slice(0, origins.index).split('\n').length : 1;
    const hit: CorsHit = { file, line, snippet: (origins?.[0] ?? "config/cors.php").replace(/\s+/g, ' ').trim().slice(0, 200) };

    if (!origins || /^\s*'\*'\s*,?\s*$/.test(origins[1])) corsLoose.push(hit);
    else corsStrict.push(hit);
    break;
  }

  /**
   * ASP.NET Core's, which is a call to the framework's own builder.
   *
   * `AddCors()` registers the service and `UseCors()` puts it in the pipeline; both
   * names belong to the framework. Jellyfin calls each of them and was told at `high`
   * that it has no cross-origin configuration.
   *
   * Which policy it is comes from the builder: `AllowAnyOrigin()` is the wide-open
   * one and `WithOrigins(...)` is a list somebody chose. Jellyfin has both — the
   * first when no hosts are configured — and where both are shipped the open branch
   * is the one worth reporting, because it is reachable.
   */
  const aspNetCors = await searchInFiles(
    ctx.root,
    source.filter((f) => /\.cs$/i.test(f)),
    [/\.\s*AddCors\s*\(/, /\.\s*UseCors\s*\(/, /\bUseCors\s*\(/, /\bAddCors\s*\(/],
    5,
  );

  if (aspNetCors.length > 0) {
    const anyOrigin = await searchInFiles(ctx.root, source.filter((f) => /\.cs$/i.test(f)), [/AllowAnyOrigin\s*\(/], 2);
    const chosen = await searchInFiles(ctx.root, source.filter((f) => /\.cs$/i.test(f)), [/WithOrigins\s*\(/, /SetIsOriginAllowed\s*\(/], 2);
    const target = anyOrigin.length > 0 || chosen.length === 0 ? corsLoose : corsStrict;
    const cited = anyOrigin[0] ?? chosen[0] ?? aspNetCors[0];

    target.push({ file: cited.file, line: cited.line, snippet: cited.snippet.trim().slice(0, 200) });
  }

  /**
   * Elixir's, which is a plug in the endpoint or the router.
   *
   * `cors_plug` and `corsica` are the two packages, and both are used the same way:
   * `plug CORSPlug, origin: ["https://app.example.com"]` or `plug Corsica, origins:
   * "*"`. The module name comes from the package, so it is the anchor; what the
   * author chose is the value of `origin`.
   *
   * `plug` takes parentheses as readily as not — plausible writes `plug(CORSPlug)` in
   * its endpoint, and a rule that required a space after the keyword could not see
   * it. Both forms are ordinary Elixir and the formatter leaves either alone.
   *
   * `"*"` is the wide-open one. A list, a function or a regex is a decision somebody
   * made, and the same reflection-versus-allowlist question the other frameworks are
   * asked. Where the plug names no origin at all, cors_plug's own default is `"*"`,
   * so silence is the open branch rather than the strict one.
   */
  const elixirCorsPackages = hasAnyElixirDep(ctx, ['cors_plug', 'corsica']);
  if (elixirCorsPackages.length > 0) {
    const elixirSource = source.filter((f) => /\.exs?$/i.test(f));
    const plugged = await searchInFiles(ctx.root, elixirSource, [/\bplug[\s(]+(?:CORSPlug|Corsica)\b/], 5);

    for (const hit of plugged) {
      const origin = /origins?:\s*(.+)$/.exec(hit.snippet);
      const wideOpen = !origin || /^["']\*["']/.test(origin[1].trim());

      (wideOpen ? corsLoose : corsStrict).push({ file: hit.file, line: hit.line, snippet: hit.snippet.trim().slice(0, 200) });
    }
  }

  const django = await findDjangoSettings(ctx);
  if (django) {
    const middlewareLine = django.text
      .split(/\r?\n/)
      .findIndex((line) => /corsheaders\.middleware\.CorsMiddleware/.test(line));

    if (middlewareLine !== -1) {
      const openedUp = /CORS_(?:ALLOW_ALL_ORIGINS|ORIGIN_ALLOW_ALL)\s*=\s*True/.exec(django.text);
      const hit: CorsHit = {
        file: django.file,
        line: middlewareLine + 1,
        snippet: openedUp
          ? openedUp[0]
          : django.text.split(/\r?\n/)[middlewareLine].trim().slice(0, 200),
      };

      if (openedUp) corsLoose.push(hit);
      else corsStrict.push(hit);
    }
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
      /**
       * Whether coverage could be established at all.
       *
       * Whether a limiter reaches the login is read from the value the package
       * produces and the paths it is mounted on — a structural question. Without the
       * optional compiler `mountedPaths` is empty and three fixtures that do throttle
       * their sign-in drop from `passed` to `partial`, told that nothing shows the
       * coverage they have.
       */
      rateLimitCoverageUnasked: wentUnasked(boundLimiterUses, source) && !rateLimitNearAuth,
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

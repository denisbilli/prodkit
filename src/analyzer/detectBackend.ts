import type { DetectorResult, DetectorEvidence } from './types';
import { hasRuntimeDep, hasRuntimePyDep, hasDep, hasAnyPhpDep, hasAnyGoDep, hasAnyGradleDep, hasAnyRuntimeRustDep, hasAnyRubyDep, hasAnyDotnetDep, hasAnyRuntimeElixirDep, type DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { DOCS_DIRECTORIES } from './detectPackaging';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { MINIMUM_LANGUAGE_SHARE, languageShare } from './languageShare';
import {
  GO_BACKEND_FRAMEWORKS,
  RUST_BACKEND_FRAMEWORKS,
  JVM_BACKEND_FRAMEWORKS,
  NODE_BACKEND_FRAMEWORKS,
  PHP_BACKEND_FRAMEWORKS,
  PYTHON_BACKEND_FRAMEWORKS,
  RUBY_BACKEND_FRAMEWORKS,
  ELIXIR_BACKEND_FRAMEWORKS,
} from './catalogue';

export async function detectBackend(ctx: DetectContext): Promise<{
  result: DetectorResult;
  frameworks: string[];
}> {
  const frameworks: string[] = [];
  const evidence: DetectorEvidence[] = [];

  /**
   * Shipped, not merely present.
   *
   * axios declares `express` in devDependencies to run a test server against itself,
   * and was read as having a backend — which kept a library out of the `library`
   * profile. A server framework the product does not ship with is a fixture. The
   * fallback below still reads the source, so a project that runs Express without
   * declaring it is found anyway.
   *
   * Not one repository in the local corpus declares a backend framework only in
   * devDependencies, so this changes nothing there and fixes a public library.
   */
  // Express
  if (hasRuntimeDep(ctx, 'express')) {
    frameworks.push('express');
    evidence.push({ type: 'dependency', value: 'express' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => /\.(js|ts|mjs|cjs)$/.test(f)),
      [/require\(['"]express['"]\)/, /from ['"]express['"]/],
      3
    );
    if (matches.length) {
      frameworks.push('express');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // Node backend frameworks detected purely from dependencies.
  //
  // SvelteKit, Remix and Nuxt appear here as well as in the frontend detector, and
  // that is not a mistake: they serve their own routes, so a repository built on one
  // has a backend to be judged even though it also has a UI. Treating them as
  // frontend-only meant an application with server routes, sessions and database
  // access was scored as though it had none of them.
  for (const [framework, dep] of NODE_BACKEND_FRAMEWORKS) {
    if (hasRuntimeDep(ctx, dep)) {
      frameworks.push(framework);
      evidence.push({ type: 'dependency', value: dep });
    }
  }

  /**
   * Go, read from go.mod. The standard library is a legitimate answer here in a way it
   * is not elsewhere: plenty of production Go services use net/http and nothing else,
   * so a module with Go sources and no framework is reported as `go` rather than as
   * nothing.
   */
  let namedGoFramework = false;

  for (const [framework, deps] of GO_BACKEND_FRAMEWORKS) {
    const hits = hasAnyGoDep(ctx, deps);
    if (!hits.length) continue;

    namedGoFramework = true;
    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  /**
   * A go.mod is not a Go backend on its own.
   *
   * windmill carries one for a client SDK beside 547 Rust files, and the report said
   * "Backend: go". The same share test the mobile detector already uses: a language
   * has to be a real part of what is written here before it names the backend.
   */
  const goShare = languageShare(ctx, /\.go$/);

  /**
   * A Go module is not a server for being a Go module.
   *
   * The fallback asked for a `go.mod` and enough Go to be the product, and named the
   * backend `go`. testify is 100% Go and is a testing library: it came out with a
   * backend, which made it a product with a server, which kept it out of the
   * `library` profile — the same chain the `.csproj` fallback produced for Moq.
   *
   * Go's standard library does have an HTTP server, which is why this fallback exists
   * at all and why Rust's was deleted in 0.71.0. So the test is the server side of
   * it: `ListenAndServe`, an `http.Server` value, a handler registered on a mux.
   * `net/http` alone is not enough — testify imports it to build a round tripper,
   * which is the client.
   */
  const servesOverHttp = goShare >= MINIMUM_LANGUAGE_SHARE
    ? await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => /\.go$/.test(f)),
      [
        /\bhttp\.ListenAndServe(TLS)?\s*\(/,
        /\bhttp\.Server\s*\{/,
        /\bhttp\.(Handle|HandleFunc)\s*\(/,
        /\bhttp\.NewServeMux\s*\(/,
        /**
         * The handler signature, which is the contract itself.
         *
         * A Go service often keeps its handlers in one package and its
         * `ListenAndServe` in another, so requiring the server call missed the
         * commonest shape: the `password-recovery-wording` fixture is one handler
         * taking `http.ResponseWriter` and nothing else, and it stopped being a
         * backend. Nothing on the client side is handed a ResponseWriter — testify
         * defines a `TestResponseWriter` of its own and never names the interface.
         */
        /\bhttp\.ResponseWriter\b/,
      ],
      3,
    )
    : [];

  if (!namedGoFramework && servesOverHttp.length > 0 && ctx.files.all.some((f) => /(^|\/)go\.mod$/.test(f))) {
    frameworks.push('go');
    for (const hit of servesOverHttp.slice(0, 1)) {
      evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
    }
  }

  /** The JVM, read from pom.xml and build.gradle alike: coordinates are the same shape. */
  for (const [framework, deps] of JVM_BACKEND_FRAMEWORKS) {
    const hits = hasAnyGradleDep(ctx, deps);
    if (!hits.length) continue;

    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  /** Rust, read from Cargo.toml. */
  for (const [framework, deps] of RUST_BACKEND_FRAMEWORKS) {
    const hits = hasAnyRuntimeRustDep(ctx, deps);
    if (!hits.length) continue;

    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  /**
   * No fallback for Rust, and removing it is a correction of my own over-reach.
   *
   * This was written to mirror Go's, whose justification is that plenty of production
   * services use `net/http` and nothing else. Rust's standard library has no HTTP
   * server at all, so the mirror does not hold: a crate with no web framework is
   * overwhelmingly a library, a parser or a command-line tool.
   *
   * ruff is the measurement. A linter with `Cargo.toml` at its root reported
   * `backend: rust`, and "a backend disqualifies a library" then profiled it as a
   * client application — so teaching this analyzer to read Rust made it worse at
   * reading the best-known Rust project in the corpus. `hyper` joins the framework
   * list instead: it is what a Rust service uses when it uses no framework.
   */

  /** Ruby, read from the Gemfile. */
  let namedRubyFramework = false;

  for (const [framework, deps] of RUBY_BACKEND_FRAMEWORKS) {
    const hits = hasAnyRubyDep(ctx, deps);
    if (!hits.length) continue;

    namedRubyFramework = true;
    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  /**
   * Elixir, read from mix.exs.
   *
   * No fallback beside it, for Rust's reason rather than Go's: Elixir's standard
   * library has no HTTP server, so a mix project with no Phoenix, Plug or Bandit in
   * it is a library or a release tool. Phoenix is what serves the requests when
   * anything does.
   */
  for (const [framework, deps] of ELIXIR_BACKEND_FRAMEWORKS) {
    const hits = hasAnyRuntimeElixirDep(ctx, deps);
    if (!hits.length) continue;

    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  /**
   * A Gemfile is not a Ruby backend on its own.
   *
   * WordPress-iOS and BlueWallet both reported `backend: ruby`. Neither ships a Ruby
   * server: both keep a Gemfile for fastlane and CocoaPods, which is how the iOS
   * world runs its build. WordPress-iOS has 23 Ruby files among 2675 — under one per
   * cent — and the backend it did not have then excluded it from the mobile profile,
   * so an iOS application with 2649 Swift files was judged as a B2B SaaS and told it
   * needed a health endpoint.
   *
   * The same share test Go already uses, and the reason Rust's fallback was removed
   * outright a release ago: a language has to be a real part of what is written here
   * before it names the backend.
   */
  if (
    !namedRubyFramework
    && languageShare(ctx, /\.rb$/) >= MINIMUM_LANGUAGE_SHARE
    && ctx.files.all.some((f) => /(^|\/)Gemfile$/.test(f))
  ) {
    frameworks.push('ruby');
    evidence.push({ type: 'note', value: 'a Gemfile with no web framework in it' });
  }

  /**
   * PHP, read from composer.json.
   *
   * A framework here is as conclusive as one in package.json: nobody requires
   * laravel/framework for a reason other than building on Laravel. Plain `php` in the
   * requirements is enough to say the backend is PHP even when the framework is not
   * one of these — which is better than the "unknown" this used to report for a
   * published application with 57 PHP files in it.
   */
  let namedPhpFramework = false;

  for (const [framework, deps] of PHP_BACKEND_FRAMEWORKS) {
    const hits = hasAnyPhpDep(ctx, deps);
    if (!hits.length) continue;

    namedPhpFramework = true;
    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  if (!namedPhpFramework && (hasAnyPhpDep(ctx, ['php']).length > 0 || ctx.files.source.some((f) => f.endsWith('.php')))) {
    frameworks.push('php');
    evidence.push({ type: 'note', value: 'PHP sources with no framework named in composer.json' });
  }

  /**
   * .NET. The SDK attribute decides, not a package.
   *
   * `Microsoft.NET.Sdk.Web` is what turns a project into a web application, and it is
   * declared on the project element rather than in any dependency list — so a
   * detector reading only packages would miss the plainest statement in the file.
   */
  if (ctx.dotnetWebSdk || hasAnyDotnetDep(ctx, ['Microsoft.AspNetCore']).length > 0) {
    frameworks.push('aspnet-core');
    evidence.push({
      type: 'note',
      value: ctx.dotnetWebSdk ? 'a project declaring Microsoft.NET.Sdk.Web' : 'an ASP.NET Core package reference',
    });
  }
  /**
   * A `.csproj` with no web SDK used to be listed as a backend called "dotnet", and
   * that is the same mistake the Rust fallback made before 0.71.0: a project file is
   * not a server.
   *
   * .NET builds libraries, console tools, desktop applications and web services from
   * the same project format, and `Microsoft.NET.Sdk.Web` is the line that says which.
   * Moq — a mocking library, 243 C# files — was reported with "Backend: dotnet",
   * which made it a product with a server, which kept it out of the `library` profile
   * and got it judged as a client application: asked at `high` for state durability,
   * asset delivery and browser crash reporting.
   *
   * Nothing replaces it. The language is already named in the reading-depth line and
   * in the package manager, and "this is a .NET project" was never an answer to
   * "what serves the requests".
   */

  /**
   * A Cloudflare Worker, which is a server with no server framework in it.
   *
   * `wrangler.toml` names the entry module and the compatibility date; the module
   * exports an object with a `fetch` handler. That pair is Cloudflare's documented
   * contract and there is no other way to write a Worker — but together they were read
   * as nothing at all: no backend, no stack, and a report that declined to score.
   *
   * Both halves are required. A `wrangler.toml` beside a static site deploys Pages and
   * serves no requests of its own, and an `export default { fetch }` with no manifest
   * is a module somebody may import.
   *
   * Weaker than the rest of this file, and worth saying: the shape was diagnosed on a
   * case built from Cloudflare's documentation rather than found in a repository. Every
   * other rule here has a named project behind it. A real Worker should confirm this
   * one.
   */
  const wranglerManifests = ctx.files.all.filter((f) => /(^|\/)wrangler\.(toml|jsonc?)$/.test(f));
  if (wranglerManifests.length > 0 && !frameworks.includes('hono')) {
    const fetchHandler = await searchInFiles(
      ctx.root,
      ctx.files.source,
      [/export\s+default\s*\{[\s\S]{0,120}?\bfetch\s*\(/, /^\s*async\s+fetch\s*\(\s*request/m],
      2,
    );

    if (fetchHandler.length > 0) {
      frameworks.push('cloudflare workers');
      evidence.push({ type: 'file', value: wranglerManifests[0], file: wranglerManifests[0] });
      for (const hit of fetchHandler.slice(0, 1)) {
        evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
      }
    }
  }

  /**
   * Astro, which is a backend only when it is configured to be one.
   *
   * Astro builds a static site by default and becomes a server when `output` is set
   * to `server` or `hybrid`, or when an adapter is installed. Listing it as a backend
   * unconditionally would be worse than not listing it at all: this tool scores a
   * project against what its kind of product is expected to have, so a static
   * brochure site would start being marked down for missing sessions, tenant
   * isolation and an audit trail it has no reason to want.
   */
  if (hasDep(ctx, 'astro')) {
    const configFile = ctx.files.all.find((f) => /(^|\/)astro\.config\.[cm]?[jt]s$/.test(f));
    const config = configFile ? ((await readTextFileSafe(ctx.root, configFile)) ?? '') : '';
    const servesRequests =
      /output\s*:\s*['"](?:server|hybrid)['"]/.test(config)
      || /adapter\s*:/.test(config)
      || ctx.files.all.some((f) => /(^|\/)src\/pages\/api\//.test(f));

    if (servesRequests) {
      frameworks.push('astro');
      evidence.push({
        type: configFile ? 'file' : 'dependency',
        value: configFile ? `astro configured to serve requests (${configFile})` : 'astro',
        ...(configFile ? { file: configFile } : {}),
      });
    }
  }

  // Python backend frameworks detected purely from dependencies. Django, Flask and
  // FastAPI have their own blocks below because each also has a source-level fallback.
  /**
   * Shipped, not offered as an extra — the Python half of the same rule.
   *
   * llama_index declares tornado, starlette, flask and fastapi among its optional
   * integrations, and was read as running all four.
   */
  for (const [framework, dep] of PYTHON_BACKEND_FRAMEWORKS) {
    if (hasRuntimePyDep(ctx, dep)) {
      frameworks.push(framework);
      evidence.push({ type: 'dependency', value: dep });
    }
  }

  /**
   * aiohttp is a client as often as it is a server.
   *
   * Thousands of packages depend on it to make HTTP requests; langchain is one, and was
   * read as having a backend because of it — which cost it the `library` profile and
   * earned it fifteen high findings about GDPR, billing and tenant isolation. The
   * dependency says the library is present. Only `aiohttp.web` says it is being served.
   *
   * The source alone is enough, as elsewhere: a project that serves without declaring
   * the dependency is still serving.
   */
  if (hasRuntimePyDep(ctx, 'aiohttp')) {
    const serving = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((file) => /\.py$/.test(file)),
      [/aiohttp\.web/, /web\.Application\(/, /web\.RouteTableDef/, /from aiohttp import web/],
      3,
    );

    if (serving.length) {
      frameworks.push('aiohttp');
      for (const match of serving) {
        evidence.push({ type: 'snippet', value: match.snippet, file: match.file, line: match.line });
      }
    }
  }

  // Flask
  if (hasRuntimePyDep(ctx, 'flask')) {
    frameworks.push('flask');
    evidence.push({ type: 'dependency', value: 'flask' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from flask import/, /import flask/, /Flask\(__name__\)/],
      3
    );
    if (matches.length) {
      frameworks.push('flask');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // FastAPI
  if (hasRuntimePyDep(ctx, 'fastapi')) {
    frameworks.push('fastapi');
    evidence.push({ type: 'dependency', value: 'fastapi' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from fastapi import/, /import fastapi/, /FastAPI\(/, /APIRouter\(/],
      3
    );
    if (matches.length) {
      frameworks.push('fastapi');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  /**
   * Django, which four filenames were enough to declare.
   *
   * Any two of `manage.py`, a file ending in `settings.py`, a file ending in `urls.py`
   * and the dependency named Django, and three of those four are names other projects
   * use. redash is a Flask application: it keeps a `manage.py`, and
   * `redash/handlers/settings.py` is the HTTP handler for a user's settings page. Its
   * report said "Backend: flask, django".
   *
   * The dependency is the fact — nobody runs Django without installing it — and the
   * filenames only corroborate it.
   *
   * A fallback for the unreadable-manifest case was written and deleted: a settings
   * file declaring `INSTALLED_APPS` would have stood on its own, and no repository
   * measured reaches it, because every Django project declares Django. The mutation
   * run said so — removing it failed nothing. A rule nothing measures is a rule to
   * delete.
   */
  const djangoSignals: DetectorEvidence[] = [];
  const djangoDep = hasRuntimePyDep(ctx, 'django');
  if (djangoDep) djangoSignals.push({ type: 'dependency', value: 'django' });
  if (ctx.files.all.some((f) => f.endsWith('manage.py') || f === 'manage.py')) {
    djangoSignals.push({ type: 'file', value: 'manage.py' });
  }
  const settingsFile = ctx.files.all.find((f) => f.endsWith('settings.py'));
  if (settingsFile) djangoSignals.push({ type: 'file', value: settingsFile });
  if (ctx.files.all.some((f) => f.endsWith('urls.py'))) {
    djangoSignals.push({ type: 'file', value: ctx.files.all.find((f) => f.endsWith('urls.py'))! });
  }

  if (djangoDep && djangoSignals.length >= 2) {
    frameworks.push('django');
    evidence.push(...djangoSignals);
  }

  /**
   * Whether an application is built anywhere a product would build one.
   *
   * The evidence above is a sample — three lines per framework, in file order — so it
   * cannot say where servers are *not*. This asks directly: is an application instance
   * created, or a server started, in a file outside docs, examples and tests? FastAPI's
   * `app = FastAPI()` lines are all in `docs_src/`; a product that uses FastAPI makes one
   * in its own package. The constructors and entry points are the frameworks' own.
   */
  const outsideDocs = frameworks.length > 0
    ? ctx.files.source.filter((f) => !DOCS_DIRECTORIES.test(f) && !/(^|\/)(tests?|__tests__|spec|specs)\//.test(f))
    : [];
  const servedOutsideDocs = outsideDocs.length > 0 && (await searchInFiles(ctx.root, outsideDocs, APP_INSTANCE, 1)).length > 0;

  return {
    frameworks,
    result: {
      key: 'stack.backend',
      present: frameworks.length > 0,
      evidence,
      details: { frameworks, servedOutsideDocs },
    },
  };
}

const APP_INSTANCE = [
  /\b\w+\s*=\s*(?:FastAPI|Flask|Starlette|Quart|Sanic|Litestar|Robyn)\s*\(/,
  /\bget_(?:wsgi|asgi)_application\s*\(/,
  /\bexpress\s*\(\s*\)/,
  /\bnew\s+(?:Hono|Koa|Elysia)\s*\(/,
  /\b(?:Fastify|fastify)\s*\(\s*\{?/,
  /\bNestFactory\.create\s*\(/,
  /\buvicorn\.run\s*\(/,
  /\bhttp\.ListenAndServe\s*\(/,
  /\bRails\.application\b/,
];

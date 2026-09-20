import type { DetectorResult, DetectorEvidence } from './types';
import { hasRuntimeDep, hasRuntimePyDep, hasDep, hasAnyPhpDep, hasAnyGoDep, hasAnyGradleDep, hasAnyRuntimeRustDep, hasAnyRubyDep, hasAnyDotnetDep, type DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import {
  GO_BACKEND_FRAMEWORKS,
  RUST_BACKEND_FRAMEWORKS,
  JVM_BACKEND_FRAMEWORKS,
  NODE_BACKEND_FRAMEWORKS,
  PHP_BACKEND_FRAMEWORKS,
  PYTHON_BACKEND_FRAMEWORKS,
  RUBY_BACKEND_FRAMEWORKS,
} from './catalogue';

/**
 * How much of the source is written in one language.
 *
 * A manifest says a language is present; a share says it is what the product is made
 * of. The mobile detector has drawn this distinction since a single MAUI client
 * decided the profile of a nine-project .NET solution.
 */
function languageShare(ctx: DetectContext, extension: RegExp): number {
  const source = ctx.files.source;
  if (source.length === 0) return 0;

  return source.filter((file) => extension.test(file)).length / source.length;
}

/**
 * Below this a language is present in the repository without being what serves the
 * requests.
 *
 * windmill is the measurement: two Go files beside 547 Rust ones, 0.05% of its source,
 * and the report said "Backend: go". The line is not tuned to that case — anything
 * under one file in twenty is a client, a script or a sample, and every backend in the
 * verification corpus is far above it. A repository genuinely split between two server
 * languages reports both, which is the right answer for one.
 */
const MINIMUM_BACKEND_SHARE = 0.05;

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

  if (!namedGoFramework && goShare >= MINIMUM_BACKEND_SHARE && ctx.files.all.some((f) => /(^|\/)go\.mod$/.test(f))) {
    frameworks.push('go');
    evidence.push({ type: 'note', value: 'a Go module with no web framework named in go.mod' });
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
    && languageShare(ctx, /\.rb$/) >= MINIMUM_BACKEND_SHARE
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
  } else if (ctx.dotnetDeps.length > 0 || ctx.files.all.some((f) => /\.csproj$/i.test(f))) {
    frameworks.push('dotnet');
    evidence.push({ type: 'note', value: 'a .NET project with no web SDK' });
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

  // Django
  const djangoSignals: DetectorEvidence[] = [];
  if (ctx.files.all.some((f) => f.endsWith('manage.py') || f === 'manage.py')) {
    djangoSignals.push({ type: 'file', value: 'manage.py' });
  }
  const settingsFile = ctx.files.all.find((f) => f.endsWith('settings.py'));
  if (settingsFile) djangoSignals.push({ type: 'file', value: settingsFile });
  if (hasRuntimePyDep(ctx, 'django')) djangoSignals.push({ type: 'dependency', value: 'django' });
  if (ctx.files.all.some((f) => f.endsWith('urls.py'))) {
    djangoSignals.push({ type: 'file', value: ctx.files.all.find((f) => f.endsWith('urls.py'))! });
  }
  if (djangoSignals.length >= 2) {
    frameworks.push('django');
    evidence.push(...djangoSignals);
  }

  return {
    frameworks,
    result: {
      key: 'stack.backend',
      present: frameworks.length > 0,
      evidence,
      details: { frameworks },
    },
  };
}

import { detectPackaging } from './detectPackaging';
import { pythonImports, browserImports } from './importedDependencies';
import * as path from 'path';
import { z } from 'zod';
import { scanFiles } from '../utils/fileScanner';
import { readJsonSafe, readTextFileSafe } from '../utils/readTextFileSafe';
import { detectPackageManager } from './detectPackageManager';
import { detectFrontend } from './detectFrontend';
import { detectBackend } from './detectBackend';
import { detectDatabase } from './detectDatabase';
import { detectAudit } from './detectAudit';
import { detectGame } from './detectGame';
import { detectClientLogic } from './detectClientLogic';
import { detectMobile } from './detectMobile';
import { detectErrorReporting } from './detectErrorReporting';
import { detectDocker } from './detectDocker';
import { detectEnv } from './detectEnv';
import { detectAuth } from './detectAuth';
import { detectSecurity } from './detectSecurity';
import { detectUploads } from './detectUploads';
import { detectGdpr } from './detectGdpr';
import { detectBilling } from './detectBilling';
import { detectObservability } from './detectObservability';
import { detectJobs } from './detectJobs';
import { detectMarketplace } from './detectMarketplace';
import { detectAiSafety } from './detectAiSafety';
import { detectEngagement } from './detectNotifications';
import { detectDeployment } from './detectDeployment';
import { buildStackInfo, mergeDetectors } from './detectStack';
import type { DetectContext, WorkspaceManifest } from './detectContext';
import type { PackageJson, ProjectAnalysis, WorkspaceStack } from './types';
import { stat } from 'node:fs/promises';
import { typeScriptIsAvailable } from './structural/loadTypeScript';

const packageJsonSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    scripts: z.record(z.string()).optional(),
  })
  .passthrough();

function parseRequirements(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/[<=>~![]/)[0].trim().toLowerCase())
    .filter(Boolean);
}

function normalizePyDepSpec(spec: string): string {
  return spec.split(/[\s<>=!~;[(]/)[0].trim().toLowerCase();
}

/**
 * What a Python package installs by default, and what it merely offers.
 *
 * `[project.optional-dependencies]` and `[dependency-groups]` are extras: a library that
 * integrates with FastAPI declares it there, and nobody installing the library gets a
 * web server. langchain and llama_index declare four web frameworks between them that
 * way, and were read as web applications — costing langchain the `library` profile and
 * earning it fifteen high findings about GDPR, billing and tenant isolation.
 *
 * Mirrors what `dependencies` and `devDependencies` already do for npm.
 */
function parsePyprojectRuntime(text: string | null): string[] {
  return parsePyprojectSections(text, true);
}

function parsePyproject(text: string | null): string[] {
  return parsePyprojectSections(text, false);
}

function parsePyprojectSections(text: string | null, runtimeOnly: boolean): string[] {
  if (!text) return [];
  const deps: string[] = [];
  let section = '';
  let inDependencyArray = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const header = line.match(/^\[+([^\]]+)]+$/);
    if (header) {
      section = header[1].trim();
      inDependencyArray = false;
      continue;
    }

    // Poetry-style tables: each key of the section is a dependency name.
    const isPoetryDepsSection = section === 'tool.poetry.dependencies'
      || (!runtimeOnly && (section === 'tool.poetry.dev-dependencies'
        || /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section)));
    if (isPoetryDepsSection) {
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
      if (match && match[1].toLowerCase() !== 'python') deps.push(match[1].toLowerCase());
      continue;
    }

    // PEP 621 / uv style: dependency specs live inside string arrays.
    const isDepArraySection = !runtimeOnly
      && (section === 'project.optional-dependencies'
        || section === 'dependency-groups'
        || section === 'tool.uv');
    if (section === 'project' || isDepArraySection || inDependencyArray) {
      if (line.includes('include-group')) continue;
      const startsArray = section === 'project'
        ? /^dependencies\s*=\s*\[/.test(line)
        : isDepArraySection && /^[A-Za-z0-9_-]+\s*=\s*\[/.test(line);
      if (!inDependencyArray && !startsArray) continue;
      for (const quoted of line.matchAll(/["']([^"']+)["']/g)) {
        const name = normalizePyDepSpec(quoted[1]);
        if (name) deps.push(name);
      }
      // Only a closing bracket outside quoted specs ends the array — specs
      // like "fastapi[standard]>=0.114" contain brackets of their own.
      const lineWithoutStrings = line.replace(/["'][^"']*["']/g, '');
      inDependencyArray = (inDependencyArray || startsArray) && !lineWithoutStrings.includes(']');
    }
  }

  return deps;
}

/**
 * Everything after `src/main/java` is a package name, not a project layout.
 *
 * spring-petclinic lives in `org.springframework.samples.petclinic`, so every one of
 * its thirty Java files sat under a path segment called `samples`, and the rule that
 * removes sample code removed the whole application: twelve files, an HTML front end,
 * no backend, and `client-app` at high confidence for a Spring Boot server.
 *
 * It was not only `samples`. `spring-test/src/main/java/org/springframework/mock/`
 * holds forty-four files — `MockHttpServletRequest` and its neighbours, shipped in the
 * jar and the whole point of that module — and the rule that removes `mocks/` removed
 * every one of them. A package can be called anything: `vendor`, `testing`, `fixtures`
 * are all ordinary domain words.
 *
 * Maven and Gradle fix the `src/main/<language>` prefix, so directory rules are
 * applied to the path *up to* it and never to the package below.
 *
 * Only `main` is named, and that is a statement of intent rather than a rule doing
 * work: `src/test/java/...` stays excluded either way, because the boundary itself
 * contains `test` and the directory rule matches it. Writing `main|test` here fails
 * no test, which is worth saying instead of implying a protection that is not there.
 */
const JVM_MAIN_SOURCE_ROOT = /(^|\/)src\/main\/(java|kotlin|scala|groovy)\//;

/** The part of the path that describes layout rather than package. */
function layoutPartOf(file: string): string {
  const root = JVM_MAIN_SOURCE_ROOT.exec(file);

  return root ? file.slice(0, root.index + root[0].length) : file;
}

/**
 * Go names its tests by file, never by directory.
 *
 * `_test.go` is the suffix the toolchain compiles separately; a directory called
 * `mock`, `testing` or `fixtures` is just a package. testify's own `mock/mock.go` —
 * half of what that library is for — was removed by the rule that drops `mocks/`, and
 * the analyzer saw 38 of its Go files with the two biggest missing.
 *
 * One directory convention is left here, and it is the toolchain's: a directory whose
 * name begins with `_` or `.` is skipped when building, which is why testify keeps
 * `_codegen` and `_readme-gofmt` under those names.
 *
 * `vendor/` and `testdata/` are not repeated: the file scanner never hands them over
 * in the first place. Both were written here and both survived being deleted in a
 * mutation run, which is how the duplication came to light.
 */
function isGoToolchainExclusion(file: string): boolean {
  return /(^|\/)[_.][^/]+\//.test(file);
}

function isTestOrExamplePath(file: string): boolean {
  // `__mocks__` was missing, and a mock is the most misleading file in a repository:
  // `application_fee_percent: null` inside a Stripe fixture made an open-source CRM read
  // as a marketplace taking a cut. A field set to null is evidence of absence.
  // `fixtures` was listed and `fixture` was not, so `extra/fixture/authsources.php`
  // made PHP one of the languages of an Elixir analytics product — and of cal.com,
  // which is TypeScript.
  /**
   * A Go file answers to Go's conventions and to none of the directory rules below:
   * every one of those names is a package name there.
   */
  if (/\.go$/.test(file)) return isGoToolchainExclusion(file) || /_test\.go$/.test(file);

  const layout = layoutPartOf(file);

  return /(^|\/)(__tests__|__mocks__|mocks?|tests?|test-data|fixtures?|frontend-example)(\/|$)/i.test(layout)
    /**
     * The conventions other ecosystems use, which this list did not know.
     *
     * Three real products each raised a critical — the severity that bars a report from
     * the top band — and every piece of evidence behind all three came from a test:
     * cal.com from `playwright/` and `*.e2e.ts`, chatwoot from `spec/`, which is where
     * every Ruby project puts its tests, medusa from `integration-tests/`. A syntax tree
     * would have parsed the same files and reached the same wrong conclusion, which is
     * the argument for fixing what gets read before fixing how.
     */
    || /(^|\/)(spec|specs|e2e|integration-tests?|cypress|playwright|testing)(\/|$)/i.test(layout)
    || /\.(e2e|e2e-spec|cy|stories)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(file)
    || /_spec\.rb$/i.test(file)
    || /_test\.(go|py|rb|java|cs|php)$/i.test(file)
    || /(^|\/)test[-_][^/]+\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file)
    /**
     * The other half of the convention.
     *
     * `test_settings.py` was recognised and `settings_tests.py` was not, so a Django
     * project's test configuration was read as production and its `STRIPE_SECRET_KEY =
     * "sk_test_fake"` raised a critical — the severity that bars a report from the top
     * band — against a line written to be fake.
     */
    || /[-_]tests?\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file)
    /**
     * And the third spelling of it.
     *
     * netbox keeps `netbox/netbox/configuration_testing.py`, whose first three lines
     * say it is a base configuration for testing and not intended for production. Its
     * `SECRET_KEY = 'abcdefg...'` was the single `critical` in netbox's report — the
     * severity that bars a report from the top band — raised against a line written to
     * be thrown away.
     *
     * A directory called `testing/` has counted as tests here for a while, so the
     * suffix is the same decision in the same ecosystem. It does cost a product file
     * genuinely named `ab_testing.py`, which would go unread rather than be read
     * wrongly — the cheaper of the two errors, and the same trade the `testing/`
     * directory rule already makes.
     */
    || /[-_]testing\.py$/i.test(file)
    || /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file)
    /**
     * Sample code, which is what a documentation repository is made of.
     *
     * Every one of ktor-documentation's 435 Kotlin files sits under
     * `codeSnippets/snippets/`, and the report judged them as a product: nine essential
     * capabilities missing at `high`, including email verification and GDPR consent,
     * for a repository that is documentation.
     *
     * `examples` was already here in the sense that mattered to Node; `samples` and
     * `snippets` are the same idea spelled the way the JVM and the Rust ecosystems
     * spell it. A repository whose every source file is a sample now has no source
     * files, and says so — which is the honest answer for one.
     */
    || /(^|\/)(samples?|snippets?|codesnippets)(\/|$)/i.test(layout)
    /**
     * Somebody else's code, vendored in.
     *
     * meilisearch was reported as using Rocket. Rocket appears once in the repository,
     * as a dev-dependency of `external-crates/reqwest-eventsource` — a third-party
     * crate copied in whole. A manifest under a vendor directory is a statement about
     * that library, not about this product.
     */
    || /(^|\/)(vendor|vendored|third[-_]?party|external[-_]crates)(\/|$)/i.test(layout);
}

/**
 * Extensions the detectors can read.
 *
 * PHP, Go, Ruby, Java, C# and Rust are here because a detector that greps for a
 * hardcoded secret, an open CORS policy or an unprotected upload does not care what
 * language surrounds the line. Stack detection still leans on manifests, so a Laravel
 * application is not fully understood by being readable — but being readable is the
 * difference between a partial reading and none.
 */
/**
 * `.html` is here, and it is not decoration.
 *
 * Without it a repository whose entire product is one `index.html` with an inline
 * `<script>` — a browser game, a static site, a prototype — was reported as having zero
 * source files, no stack, and a score capped at 39 for being unreadable. `PhaserJS-
 * Spacegame` is exactly that: a complete game, Phaser loaded from a CDN, and nothing
 * for the analyzer to look at. A hardcoded key in an inline script is also a real
 * finding, and every text search here was skipping the file it would be in.
 *
 * `.vue`, `.svelte` and `.astro` were missing for the same reason: a single-file
 * component holds the logic, not just the markup.
 */
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|php|go|rb|java|cs|rs|kt|swift|dart|html?|vue|svelte|astro)$/;

function pickSource(files: string[]): string[] {
  return files.filter((f) => SOURCE_EXTENSIONS.test(f) && !isTestOrExamplePath(f));
}

/**
 * Languages present in the repository that nothing here can read.
 *
 * The failure this exists to stop: a published PHP application, 57 source files, was
 * analysed from the single JavaScript file in it. The report named a backend of
 * "unknown", raised a critical for missing authentication that is written in PHP, and
 * said "Warnings: none" — confident, detailed, and built on two per cent of the code.
 *
 * Being wrong is recoverable. Being wrong while announcing no reservations is not.
 */
const KNOWN_UNREADABLE: Array<[RegExp, string]> = [
  [/\.(ex|exs)$/, 'Elixir'],
  [/\.(scala|sc)$/, 'Scala'],
  [/\.(clj|cljs)$/, 'Clojure'],
  [/\.(cpp|cc|hpp)$/, 'C++'],
  [/\.(erl|hrl)$/, 'Erlang'],
  [/\.(hs)$/, 'Haskell'],
  [/\.(pl|pm)$/, 'Perl'],
  [/\.(lua)$/, 'Lua'],
];

function unreadableLanguages(files: string[]): Array<{ language: string; files: number }> {
  return KNOWN_UNREADABLE
    .map(([pattern, language]) => ({ language, files: files.filter((f) => pattern.test(f)).length }))
    .filter((entry) => entry.files > 0)
    .sort((a, b) => b.files - a.files);
}

function pickConfig(files: string[]): string[] {
  return files.filter((f) => /(package\.json|tsconfig|vite\.config|docker|compose|requirements\.txt|pyproject\.toml|settings\.py|\.env)/i.test(f));
}

function workspaceRootFromFile(file: string): string {
  const i = file.lastIndexOf('/');
  return i === -1 ? '.' : file.slice(0, i);
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

function mergeDeps(target: Record<string, string>, source: Record<string, string> | undefined): void {
  if (!source) return;
  for (const [k, v] of Object.entries(source)) target[k.toLowerCase()] = v;
}

function detectWorkspaceFrontend(npmDeps: Record<string, string>): string[] {
  const frameworks: string[] = [];
  if (npmDeps.react || npmDeps['react-dom']) frameworks.push('react');
  if (npmDeps.vite || npmDeps['@vitejs/plugin-react']) frameworks.push('vite');
  if (npmDeps.vue) frameworks.push('vue');
  if (npmDeps.nuxt) frameworks.push('nuxt');
  if (npmDeps.svelte || npmDeps['@sveltejs/kit']) frameworks.push('svelte');
  if (npmDeps['@angular/core']) frameworks.push('angular');
  if (npmDeps.electron) frameworks.push('electron');
  if (npmDeps['react-router-dom']) frameworks.push('react-router-dom');
  if (npmDeps.tailwindcss) frameworks.push('tailwindcss');
  return unique(frameworks);
}

function detectWorkspaceBackend(npmDeps: Record<string, string>, pythonDeps: string[]): string[] {
  const frameworks: string[] = [];
  if (npmDeps.express) frameworks.push('express');
  if (npmDeps.next) frameworks.push('next');
  if (npmDeps['@nestjs/core']) frameworks.push('nestjs');
  if (npmDeps.fastify) frameworks.push('fastify');
  if (pythonDeps.includes('django')) frameworks.push('django');
  if (pythonDeps.includes('fastapi')) frameworks.push('fastapi');
  if (pythonDeps.includes('flask')) frameworks.push('flask');
  return unique(frameworks);
}

function detectWorkspaceDatabases(npmDeps: Record<string, string>, pythonDeps: string[]): string[] {
  const dbs: string[] = [];
  if (npmDeps.pg || pythonDeps.includes('psycopg2')) dbs.push('postgres');
  if (npmDeps.redis || npmDeps.ioredis || pythonDeps.includes('redis')) dbs.push('redis');
  if (npmDeps.mysql2 || pythonDeps.includes('mysqlclient')) dbs.push('mysql');
  if (npmDeps.mongodb || npmDeps.mongoose) dbs.push('mongodb');
  if (npmDeps.sqlite3 || npmDeps['better-sqlite3']) dbs.push('sqlite');
  return unique(dbs);
}

function resolveWorkspacePackageManager(workspace: WorkspaceManifest): {
  manager: WorkspaceStack['packageManager'];
  confidence: WorkspaceStack['packageManagerConfidence'];
  warnings: string[];
} {
  if (workspace.lockfiles.includes('pnpm-lock.yaml')) return { manager: 'pnpm', confidence: 'lockfile', warnings: [] };
  if (workspace.lockfiles.includes('package-lock.json')) return { manager: 'npm', confidence: 'lockfile', warnings: [] };
  if (workspace.lockfiles.includes('yarn.lock')) return { manager: 'yarn', confidence: 'lockfile', warnings: [] };
  if (workspace.lockfiles.includes('poetry.lock')) return { manager: 'poetry', confidence: 'lockfile', warnings: [] };
  if (workspace.packageJsonPath) return { manager: 'npm', confidence: 'manifest', warnings: ['package-lock missing'] };
  if (workspace.pyprojectPath) return { manager: 'poetry', confidence: 'manifest', warnings: [] };
  if (workspace.requirementsPath) return { manager: 'pip', confidence: 'manifest', warnings: [] };
  return { manager: 'unknown', confidence: 'unknown', warnings: [] };
}

/**
 * A path that is not there is not an empty repository.
 *
 * This check lived in the command-line tool alone, so every other caller — the MCP
 * server an assistant drives, the hosted application, anyone using this as a library —
 * got a report for a directory that does not exist: score 39, "no frontend, backend or
 * database stack signals were detected", which reads as a verdict on a repository rather
 * than a typo in a path. The command-line tool refused the same input outright.
 *
 * The guard belongs where the work starts, so every surface refuses it the same way.
 */
export class ProjectPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectPathError';
  }
}

async function assertReadableDirectory(root: string): Promise<void> {
  let stats;
  try {
    stats = await stat(root);
  } catch {
    throw new ProjectPathError(`Project path does not exist: ${root}`);
  }

  if (!stats.isDirectory()) {
    throw new ProjectPathError(`Project path is not a directory: ${root}`);
  }
}

export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const root = path.resolve(projectPath);
  await assertReadableDirectory(root);

  const allFiles = await scanFiles({ cwd: root });
  const sourceFiles = pickSource(allFiles);
  const configFiles = pickConfig(allFiles);

  const packageJsonRaw = await readJsonSafe<PackageJson>(root, 'package.json');
  const packageJson = packageJsonRaw ? packageJsonSchema.parse(packageJsonRaw) : null;

  /**
   * The manifests this project owns, without the ones it merely contains.
   *
   * A vendored crate, a sample application and a test harness each carry a manifest,
   * and each says something about itself rather than about the product. meilisearch
   * was reported as using Rocket on the strength of a dev-dependency inside
   * `external-crates/reqwest-eventsource` — a third-party library copied in whole.
   *
   * The same rule the source list has always used, applied to the file list the
   * manifest readers walk.
   */
  const ownManifests = allFiles.filter((f) => !isTestOrExamplePath(f));

  const packageJsonFiles = allFiles.filter((f) => f.endsWith('package.json'));
  const requirementsFiles = allFiles.filter((f) => /(^|\/)requirements\.txt$/i.test(f));
  const pyprojectFiles = allFiles.filter((f) => /(^|\/)pyproject\.toml$/i.test(f));
  const lockfiles = allFiles.filter((f) => /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock)$/i.test(f));

  const workspaceRoots = new Set<string>(['.']);
  for (const file of [...packageJsonFiles, ...requirementsFiles, ...pyprojectFiles, ...lockfiles]) {
    workspaceRoots.add(workspaceRootFromFile(file));
  }

  const workspaces: WorkspaceManifest[] = [];
  for (const wsRoot of Array.from(workspaceRoots).sort()) {
    const packageJsonPath = wsRoot === '.' ? 'package.json' : `${wsRoot}/package.json`;
    const requirementsPath = wsRoot === '.' ? 'requirements.txt' : `${wsRoot}/requirements.txt`;
    const pyprojectPath = wsRoot === '.' ? 'pyproject.toml' : `${wsRoot}/pyproject.toml`;
    const packageJsonRawForWorkspace = packageJsonFiles.includes(packageJsonPath)
      ? await readJsonSafe<PackageJson>(root, packageJsonPath)
      : null;
    const packageJsonForWorkspace = packageJsonRawForWorkspace ? packageJsonSchema.parse(packageJsonRawForWorkspace) : null;
    const reqText = requirementsFiles.includes(requirementsPath)
      ? await readTextFileSafe(root, requirementsPath)
      : null;
    const pyprojectText = pyprojectFiles.includes(pyprojectPath)
      ? await readTextFileSafe(root, pyprojectPath)
      : null;
    const wsLockfiles = lockfiles
      .filter((f) => workspaceRootFromFile(f) === wsRoot)
      .map((f) => f.split('/').pop() ?? f);

    workspaces.push({
      root: wsRoot,
      packageJsonPath: packageJsonFiles.includes(packageJsonPath) ? packageJsonPath : undefined,
      packageJson: packageJsonForWorkspace,
      requirementsPath: requirementsFiles.includes(requirementsPath) ? requirementsPath : undefined,
      requirementsDeps: parseRequirements(reqText),
      pyprojectPath: pyprojectFiles.includes(pyprojectPath) ? pyprojectPath : undefined,
      pyprojectDeps: parsePyproject(pyprojectText),
      pyprojectRuntimeDeps: parsePyprojectRuntime(pyprojectText),
      lockfiles: wsLockfiles,
    });
  }

  const pythonDeps = unique(workspaces.flatMap((w) => [...w.requirementsDeps, ...w.pyprojectDeps]));
  /**
   * `requirements.txt` has no notion of an extra, so everything in it counts as shipped.
   * Only pyproject distinguishes the two.
   */
  const runtimePythonDeps = unique(workspaces.flatMap((w) => [...w.requirementsDeps, ...w.pyprojectRuntimeDeps]));

  /**
   * Composer requirements. A published PHP application in the corpus reported a
   * backend of "unknown" because nothing read this file, while 57 source files sat
   * beside it saying plainly what the project was.
   */
  /**
   * go.mod and the Gemfile, read the same way and for the same reason as composer.json:
   * a repository whose manifest nothing here parses is reported with a backend of
   * "unknown" while its source sits in plain sight.
   *
   * Both are parsed with regular expressions rather than properly. A go.mod require
   * block and a `gem 'name'` line are simple enough that a parser would be more code
   * than it is worth, and a manifest this cannot read yields no dependencies rather
   * than a wrong answer.
   */
  const goDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)go\.mod$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const line of raw.split('\n')) {
      const match = /^\s*(?:require\s+)?([a-z0-9][\w.-]*(?:\.[a-z]{2,})?\/[\w./-]+)\s+v/i.exec(line);
      if (match) goDeps.push(match[1].toLowerCase());
    }
  }

  /**
   * Cargo.toml, read for the crates a Rust project depends on.
   *
   * windmill's backend is 547 Rust files and the report said "Backend: go", on the
   * strength of one `go.mod` belonging to a client SDK. Rust was not being read at
   * all — a whole ecosystem invisible, so a Rust web service could only ever be
   * reported as whatever else happened to be lying around.
   *
   * The same hand-written reader as the others: `[dependencies]` and its variants open
   * a block, and each entry is a crate name before `=`. A version table written as
   * `[dependencies.axum]` names the crate in the heading instead, so both shapes are
   * read.
   */
  const rustDeps: string[] = [];
  /**
   * The crates the product ships with, without the ones it only builds and tests with.
   *
   * meilisearch was reported as using Rocket, from a `[dev-dependencies]` block. The
   * same distinction `runtimeNpmDeps` draws for the reason axios taught: a web
   * framework in dev-dependencies is a test server, and the question "what serves the
   * requests" is answered by what ships.
   */
  const runtimeRustDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)Cargo\.toml$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';
    let inDeps = false;
    let runtimeSection = false;

    for (const line of raw.split('\n')) {
      const heading = /^\s*\[([^\]]+)\]/.exec(line);
      if (heading) {
        const section = heading[1].trim();
        const nested = /^(?:[a-z-]+\.)?(?:dependencies|dev-dependencies|build-dependencies)\.(.+)$/.exec(section);
        if (nested) {
          const crate = nested[1].trim().toLowerCase();
          rustDeps.push(crate);
          if (/(^|\.)dependencies\./.test(section)) runtimeRustDeps.push(crate);
          inDeps = false;
          continue;
        }
        inDeps = /(^|\.)(dependencies|dev-dependencies|build-dependencies)$/.test(section);
        runtimeSection = /(^|\.)dependencies$/.test(section);
        continue;
      }
      if (!inDeps) continue;

      const entry = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line);
      if (entry) {
        rustDeps.push(entry[1].toLowerCase());
        if (runtimeSection) runtimeRustDeps.push(entry[1].toLowerCase());
      }
    }
  }

  /**
   * pubspec.yaml, read for its two dependency blocks.
   *
   * YAML with a hand-written reader again, and the shape here is forgiving: the blocks
   * are `dependencies:` and `dev_dependencies:`, and each entry is a name at one level
   * of indentation. Nested constraints — a git source, an sdk pin — sit deeper and are
   * skipped, which is right: what matters is which package is used, not where it comes
   * from.
   */
  const dartDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)pubspec\.yaml$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';
    let inDeps = false;

    for (const line of raw.split('\n')) {
      if (/^(dev_)?dependencies\s*:/.test(line)) {
        inDeps = true;
        continue;
      }

      // Any other top-level key ends the block. Without this, everything below
      // `dependencies:` to the end of the file would be read as a package.
      if (/^[a-z_]+\s*:/i.test(line)) {
        inDeps = false;
        continue;
      }

      if (!inDeps) continue;

      const match = /^\s{2}([a-z0-9_]+)\s*:/i.exec(line);
      if (match) dartDeps.push(match[1].toLowerCase());
    }
  }

  /**
   * Gradle, read from build.gradle and build.gradle.kts.
   *
   * Both dialects in one reader because the line that matters is nearly the same in
   * each: `implementation 'group:artifact:version'` in Groovy and
   * `implementation("group:artifact:version")` in Kotlin. Only the coordinate is kept —
   * group and artifact, without the version — because every rule downstream asks which
   * library is used, never which release of it.
   *
   * Version catalogs are read too, from their own file rather than by following the
   * alias. That decision was made the other way this morning and was wrong in
   * practice: pointed at android/nowinandroid — Google's own sample, built to
   * demonstrate offline-first — the analyzer reported no local database, because every
   * module says `implementation(libs.room.runtime)` and the coordinates live in
   * `gradle/libs.versions.toml`. Version catalogs are the recommended practice, so
   * skipping them failed precisely on the projects that follow it.
   *
   * No alias resolution is needed: the catalog declares `group` and `name` outright.
   * The cost is that a library declared in the catalog and used by no module is still
   * reported, which is the direction to err in — the catalog is the project's own
   * statement about what it builds with.
   */
  /**
   * pom.xml, read for the coordinates a Maven project declares.
   *
   * A Spring Boot REST API with Spring Security and PostgreSQL reported no backend and
   * no database. The manifest was recognised well enough to name the package manager
   * "maven" and then never opened — the same shape of gap Rust had, in the larger
   * ecosystem.
   *
   * `<parent>` is read alongside `<dependencies>` because that is where Spring Boot
   * declares itself: `spring-boot-starter-parent` is the single line that makes a
   * project a Spring Boot project, and a starter listed below it inherits its version
   * from there rather than stating one.
   *
   * Regular expressions rather than an XML parser, for the reason the others give: the
   * shape being read is two adjacent elements, and a manifest this cannot read yields
   * no dependencies rather than a wrong answer.
   */
  const gradleDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)pom\.xml$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(
      /<groupId>\s*([^<\s]+)\s*<\/groupId>\s*<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g,
    )) {
      gradleDeps.push(`${match[1]}:${match[2]}`.toLowerCase());
    }
  }

  for (const file of ownManifests.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(
      /\b(?:implementation|api|compileOnly|runtimeOnly|kapt|ksp|annotationProcessor|testImplementation)\s*[( ]\s*["']([^"']+)["']/g,
    )) {
      const [group, artifact] = match[1].split(':');
      if (group && artifact) gradleDeps.push(`${group}:${artifact}`.toLowerCase());
    }
  }

  for (const file of ownManifests.filter((f) => /(^|\/)libs\.versions\.toml$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    // Two spellings, both common: group and name as separate keys, or one `module`
    // holding the coordinate. Order within the line varies, so each is matched on its
    // own rather than as one pattern per line.
    for (const line of raw.split('\n')) {
      const module = /module\s*=\s*["']([^"':]+):([^"']+)["']/.exec(line);
      if (module) {
        gradleDeps.push(`${module[1]}:${module[2]}`.toLowerCase());
        continue;
      }

      const group = /group\s*=\s*["']([^"']+)["']/.exec(line);
      const name = /\bname\s*=\s*["']([^"']+)["']/.exec(line);
      if (group && name) gradleDeps.push(`${group[1]}:${name[1]}`.toLowerCase());
    }
  }

  /**
   * Swift packages, from Package.swift and the Podfile.
   *
   * Package.swift is Swift source rather than data, so what is read is the one shape
   * that is always there: `.package(url: "https://github.com/owner/name.git", ...)`.
   * The owner and repository name are kept, which is how a Swift dependency is
   * identified in practice — nobody says "the Alamofire product of the Alamofire
   * package".
   *
   * CocoaPods is simpler and still in wide use: `pod 'Alamofire'`.
   */
  const swiftDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)Package\.swift$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(/\.package\s*\(\s*url:\s*["']https?:\/\/[^"']*?\/([^/"']+?)\/([^/"']+?)(?:\.git)?["']/g)) {
      swiftDeps.push(`${match[1]}/${match[2]}`.toLowerCase());
    }
  }

  for (const file of ownManifests.filter((f) => /(^|\/)Podfile$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(/^\s*pod\s+["']([^"'/]+)/gm)) {
      swiftDeps.push(match[1].toLowerCase());
    }
  }

  /**
   * Package.resolved, which is where a Swift project's dependencies are actually
   * legible.
   *
   * `Package.swift` is read above, and on a real application it usually declares the
   * modules of that package rather than the whole tree: WordPress-iOS resolves 40-odd
   * packages and `sentry-cocoa` — its crash reporter — appears only here. The lockfile
   * is data rather than source, it names every transitive dependency, and it is
   * committed by convention, which makes it the better of the two to read.
   *
   * `identity` rather than `location`, because that is the name SPM itself uses and
   * the one that survives a repository moving host.
   */
  for (const file of ownManifests.filter((f) => /(^|\/)Package\.resolved$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(/"identity"\s*:\s*"([^"]+)"/g)) {
      swiftDeps.push(match[1].toLowerCase());
    }
  }

  /**
   * .csproj, which is XML rather than JSON or one-entry-per-line.
   *
   * Parsed with regular expressions like the others, and here that decision needs more
   * defending: XML has real nesting, and a regex cannot see it. What is being read is
   * two flat things — the Sdk attribute on the root element and the Include attribute
   * of each PackageReference — and neither depends on where it sits in the tree. A
   * project file this cannot read yields nothing, which is the same failure as an
   * unreadable package.json.
   *
   * The Sdk attribute carries more than any dependency: `Microsoft.NET.Sdk.Web` is
   * what makes a project a web application, and it appears in no package list.
   */
  const dotnetDeps: string[] = [];
  let dotnetWebSdk = false;

  for (const file of ownManifests.filter((f) => /\.(csproj|fsproj|vbproj)$/i.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    if (/Sdk\s*=\s*["']Microsoft\.NET\.Sdk\.Web["']/i.test(raw)) dotnetWebSdk = true;

    for (const match of raw.matchAll(/<PackageReference\s+Include\s*=\s*["']([^"']+)["']/gi)) {
      dotnetDeps.push(match[1].toLowerCase());
    }
    // A framework reference is how an application declares it needs the web runtime.
    for (const match of raw.matchAll(/<FrameworkReference\s+Include\s*=\s*["']([^"']+)["']/gi)) {
      dotnetDeps.push(match[1].toLowerCase());
    }
  }

  const rubyDeps: string[] = [];

  for (const file of ownManifests.filter((f) => /(^|\/)Gemfile$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const line of raw.split('\n')) {
      // Skip commented-out gems, which are otherwise indistinguishable from real ones.
      if (/^\s*#/.test(line)) continue;

      const match = /^\s*gem\s+['"]([^'"]+)['"]/.exec(line);
      if (match) rubyDeps.push(match[1].toLowerCase());
    }
  }

  const composerFiles = allFiles.filter((file) => /(^|\/)composer\.json$/.test(file));
  const phpDeps: string[] = [];

  for (const file of composerFiles) {
    const raw = await readTextFileSafe(root, file);
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      const require_ = (parsed as { require?: Record<string, string> })?.require ?? {};
      const requireDev = (parsed as { 'require-dev'?: Record<string, string> })?.['require-dev'] ?? {};

      for (const name of [...Object.keys(require_), ...Object.keys(requireDev)]) {
        phpDeps.push(name.toLowerCase());
      }
    } catch {
      // A composer.json that does not parse tells us nothing; it is not an error worth
      // failing an analysis over.
    }
  }

  const npmDeps: Record<string, string> = {};
  const runtimeNpmDeps: Record<string, string> = {};
  for (const workspace of workspaces) {
    mergeDeps(npmDeps, workspace.packageJson?.dependencies);
    mergeDeps(npmDeps, workspace.packageJson?.devDependencies);
    // Kept apart for one question only: whether this repository serves requests.
    mergeDeps(runtimeNpmDeps, workspace.packageJson?.dependencies);
  }

  /**
   * What the code imports, when nothing declared it.
   *
   * Only reached when the manifests for that language produced nothing at all, so a
   * declared dependency is never overridden by a guess at an import. Seventeen
   * repositories in the verification corpus were called unreadable on the strength of a
   * missing manifest while stating their dependencies in the first three lines of their
   * only source file.
   */
  const inferredDependencySources: string[] = [];

  if (pythonDeps.length === 0) {
    const imported = await pythonImports(root, sourceFiles);
    if (imported.length > 0) {
      pythonDeps.push(...imported);
      /**
       * An import is use, not an offer.
       *
       * These count as shipped as well as present. A repository with no manifest at all
       * — one `main.py` that imports streamlit — declares nothing optional, and treating
       * its imports as extras made a Streamlit application unreadable.
       */
      runtimePythonDeps.push(...imported);
      inferredDependencySources.push('Python imports');
    }
  }

  if (Object.keys(npmDeps).length === 0) {
    const imported = await browserImports(root, sourceFiles);
    for (const name of imported) npmDeps[name] = 'imported';
    if (imported.length > 0) inferredDependencySources.push('script tags and module imports');
  }

  const workspaceStacks: WorkspaceStack[] = workspaces.map((workspace) => {
    const wsNpmDeps: Record<string, string> = {};
    mergeDeps(wsNpmDeps, workspace.packageJson?.dependencies);
    mergeDeps(wsNpmDeps, workspace.packageJson?.devDependencies);
    const wsPythonDeps = unique([...workspace.requirementsDeps, ...workspace.pyprojectDeps]);
    const pm = resolveWorkspacePackageManager(workspace);

    return {
      root: workspace.root,
      frontend: detectWorkspaceFrontend(wsNpmDeps),
      backend: detectWorkspaceBackend(wsNpmDeps, wsPythonDeps),
      databases: detectWorkspaceDatabases(wsNpmDeps, wsPythonDeps),
      packageManager: pm.manager,
      packageManagerConfidence: pm.confidence,
      warnings: pm.warnings,
    };
  }).filter((w) =>
    w.frontend.length > 0
    || w.backend.length > 0
    || w.databases.length > 0
    || w.packageManager !== 'unknown'
  );

  const ctx: DetectContext = {
    root,
    files: { all: allFiles, source: sourceFiles, config: configFiles, unreadable: unreadableLanguages(allFiles) },
    runtimeNpmDeps,
    runtimePythonDeps,
    packageJson,
    pythonDeps,
    phpDeps: unique(phpDeps),
    goDeps: unique(goDeps),
    rustDeps: unique(rustDeps),
    runtimeRustDeps: unique(runtimeRustDeps),
    rubyDeps: unique(rubyDeps),
    dotnetDeps: unique(dotnetDeps),
    dotnetWebSdk,
    dartDeps: unique(dartDeps),
    gradleDeps: unique(gradleDeps),
    swiftDeps: unique(swiftDeps),
    npmDeps,
    workspaces,
  };

  const [pm, frontend, backend, database, docker, env, auth, security, uploads, gdpr, billing, observability, jobs, marketplace, aiSafety, engagement, deployment, audit, game, clientLogic, mobile, errorReporting, packaging] =
    await Promise.all([
      detectPackageManager(ctx),
      detectFrontend(ctx),
      detectBackend(ctx),
      detectDatabase(ctx),
      detectDocker(ctx),
      detectEnv(ctx),
      detectAuth(ctx),
      detectSecurity(ctx),
      detectUploads(ctx),
      detectGdpr(ctx),
      detectBilling(ctx),
      detectObservability(ctx),
      detectJobs(ctx),
      detectMarketplace(ctx),
      detectAiSafety(ctx),
      detectEngagement(ctx),
      detectDeployment(ctx),
      detectAudit(ctx),
      detectGame(ctx),
      detectClientLogic(ctx),
      detectMobile(ctx),
      detectErrorReporting(ctx),
      detectPackaging(ctx),
    ]);

  const detectors = mergeDetectors([
    pm.result,
    frontend.result,
    backend.result,
    database.result,
    ...database.extra,
    audit,
    ...game,
    clientLogic,
    ...mobile,
    errorReporting,
    ...packaging,
    docker,
    ...env,
    ...auth,
    security,
    uploads,
    ...gdpr,
    ...billing,
    observability,
    jobs,
    ...marketplace,
    ...aiSafety,
    ...engagement,
    deployment,
  ]);

  return {
    projectPath: root,
    scannedAt: new Date().toISOString(),
    parsedStructure: await typeScriptIsAvailable(),
    stack: buildStackInfo({
      frontend: frontend.frameworks,
      backend: backend.frameworks,
      databases: database.databases,
      dataPlatforms: (database.extra.find((d) => d.key === 'stack.dataPlatform')?.details?.platforms as string[] | undefined) ?? [],
      orms: (database.extra.find((d) => d.key === 'stack.orm')?.details?.orms as string[] | undefined) ?? [],
      packageManager: pm.manager,
      packageManagerConfidence: pm.confidence,
      /**
       * A reading built on part of the code says so.
       *
       * The report for a published PHP application said "Warnings: none" while it had
       * seen one file out of 57. Being wrong is recoverable; being wrong while
       * announcing no reservations is not.
       */
      warnings: [
        ...pm.warnings,
        ...unreadableLanguages(allFiles).map(
          (entry) => `${entry.files} ${entry.language} files were not analysed: this reading covers only part of the repository`
        ),
        // Said out loud, because a dependency nobody declared is a weaker fact than one
        // that is pinned in a lockfile, and the reader is entitled to know which of the
        // two this reading rests on.
        /**
         * Which manifest was missing, not "a manifest".
         *
         * "No dependency manifest was found: dependencies were read from Python imports"
         * was printed for a Flutter application with a `pubspec.yaml` in its root — the
         * same file the analyzer had just read to identify Flutter. The sentence is about
         * the Python and browser dependency lists specifically, so it says so.
         */
        ...(inferredDependencySources.length > 0
          ? [`Some dependencies were read from ${inferredDependencySources.join(' and ')} rather than from a manifest, so their versions are unknown.`]
          : []),
      ],
      workspaces: workspaceStacks,
      /**
       * The files this reading actually covers, not every file on disk.
       *
       * Built from `allFiles`, a single `extra/fixture/authsources.php` made PHP one of
       * the languages of an Elixir analytics product and of cal.com, which is
       * TypeScript. The languages a report names should be the ones it read; test
       * fixtures and generated output are excluded from the reading and belong out of
       * this list for the same reason.
       */
      files: sourceFiles,
    }),
    packageJson,
    pythonDeps,
    workspaceStacks,
    files: {
      unreadable: unreadableLanguages(allFiles),
      all: allFiles,
      source: sourceFiles,
      config: configFiles,
    },
    detectors,
  };
}

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

function parsePyproject(text: string | null): string[] {
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
      || section === 'tool.poetry.dev-dependencies'
      || /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section);
    if (isPoetryDepsSection) {
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
      if (match && match[1].toLowerCase() !== 'python') deps.push(match[1].toLowerCase());
      continue;
    }

    // PEP 621 / uv style: dependency specs live inside string arrays.
    const isDepArraySection = section === 'project.optional-dependencies'
      || section === 'dependency-groups'
      || section === 'tool.uv';
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

function isTestOrExamplePath(file: string): boolean {
  // `__mocks__` was missing, and a mock is the most misleading file in a repository:
  // `application_fee_percent: null` inside a Stripe fixture made an open-source CRM read
  // as a marketplace taking a cut. A field set to null is evidence of absence.
  return /(^|\/)(__tests__|__mocks__|mocks?|tests?|test-data|fixtures|frontend-example)(\/|$)/i.test(file)
    || /(^|\/)test[-_][^/]+\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file)
    || /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file);
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

export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const root = path.resolve(projectPath);
  const allFiles = await scanFiles({ cwd: root });
  const sourceFiles = pickSource(allFiles);
  const configFiles = pickConfig(allFiles);

  const packageJsonRaw = await readJsonSafe<PackageJson>(root, 'package.json');
  const packageJson = packageJsonRaw ? packageJsonSchema.parse(packageJsonRaw) : null;

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
      lockfiles: wsLockfiles,
    });
  }

  const pythonDeps = unique(workspaces.flatMap((w) => [...w.requirementsDeps, ...w.pyprojectDeps]));

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

  for (const file of allFiles.filter((f) => /(^|\/)go\.mod$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const line of raw.split('\n')) {
      const match = /^\s*(?:require\s+)?([a-z0-9][\w.-]*(?:\.[a-z]{2,})?\/[\w./-]+)\s+v/i.exec(line);
      if (match) goDeps.push(match[1].toLowerCase());
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

  for (const file of allFiles.filter((f) => /(^|\/)pubspec\.yaml$/.test(f))) {
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
  const gradleDeps: string[] = [];

  for (const file of allFiles.filter((f) => /(^|\/)build\.gradle(\.kts)?$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(
      /\b(?:implementation|api|compileOnly|runtimeOnly|kapt|ksp|annotationProcessor|testImplementation)\s*[( ]\s*["']([^"']+)["']/g,
    )) {
      const [group, artifact] = match[1].split(':');
      if (group && artifact) gradleDeps.push(`${group}:${artifact}`.toLowerCase());
    }
  }

  for (const file of allFiles.filter((f) => /(^|\/)libs\.versions\.toml$/.test(f))) {
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

  for (const file of allFiles.filter((f) => /(^|\/)Package\.swift$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(/\.package\s*\(\s*url:\s*["']https?:\/\/[^"']*?\/([^/"']+?)\/([^/"']+?)(?:\.git)?["']/g)) {
      swiftDeps.push(`${match[1]}/${match[2]}`.toLowerCase());
    }
  }

  for (const file of allFiles.filter((f) => /(^|\/)Podfile$/.test(f))) {
    const raw = (await readTextFileSafe(root, file)) ?? '';

    for (const match of raw.matchAll(/^\s*pod\s+["']([^"'/]+)/gm)) {
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

  for (const file of allFiles.filter((f) => /\.(csproj|fsproj|vbproj)$/i.test(f))) {
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

  for (const file of allFiles.filter((f) => /(^|\/)Gemfile$/.test(f))) {
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
  for (const workspace of workspaces) {
    mergeDeps(npmDeps, workspace.packageJson?.dependencies);
    mergeDeps(npmDeps, workspace.packageJson?.devDependencies);
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
    files: { all: allFiles, source: sourceFiles, config: configFiles },
    packageJson,
    pythonDeps,
    phpDeps: unique(phpDeps),
    goDeps: unique(goDeps),
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
        ...(inferredDependencySources.length > 0
          ? [`No dependency manifest was found: dependencies were read from ${inferredDependencySources.join(' and ')}, so versions are unknown.`]
          : []),
      ],
      workspaces: workspaceStacks,
      files: allFiles,
    }),
    packageJson,
    pythonDeps,
    workspaceStacks,
    files: {
      all: allFiles,
      source: sourceFiles,
      config: configFiles,
    },
    detectors,
  };
}

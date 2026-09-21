import type { DetectorResult, PackageManager } from './types';
import type { DetectContext } from './detectContext';
import { MINIMUM_LANGUAGE_SHARE, languageShare } from './languageShare';

interface PackageManagerResolution {
  manager: PackageManager;
  confidence: 'lockfile' | 'manifest' | 'inferred' | 'unknown';
  warnings: string[];
  evidence: string[];
}

/**
 * Manifests outside Node and Python, each one a file this analyzer already parses.
 *
 * Order matters only where two can coexist: a Gradle build with a `pom.xml` beside it is
 * built by Gradle, and a `.csproj` next to a `packages.config` is NuGet either way.
 *
 * Read from the file list rather than from the workspace record, because the workspace
 * record was built for Node and Python and knows nothing about these — which is the
 * reason a Flutter project came out as `unknown` in the first place.
 */
const OTHER_MANIFESTS: Array<{ manager: PackageManager; pattern: RegExp }> = [
  { manager: 'pub', pattern: /(^|\/)pubspec\.yaml$/ },
  { manager: 'composer', pattern: /(^|\/)composer\.json$/ },
  { manager: 'go modules', pattern: /(^|\/)go\.mod$/ },
  { manager: 'cargo', pattern: /(^|\/)Cargo\.toml$/ },
  { manager: 'bundler', pattern: /(^|\/)Gemfile$/ },
  { manager: 'mix', pattern: /(^|\/)mix\.exs$/ },
  { manager: 'gradle', pattern: /(^|\/)build\.gradle(\.kts)?$/ },
  { manager: 'maven', pattern: /(^|\/)pom\.xml$/ },
  { manager: 'nuget', pattern: /\.(csproj|fsproj|vbproj)$/i },
  /**
   * Both Apple ecosystems, added once their manifests were actually being parsed —
   * `Package.swift` and the Podfile for a long while, `Package.resolved` since 0.75.0.
   * Until then an iOS application could only ever come out as `npm` or `unknown`,
   * which is how DuckDuckGo iOS — 1194 Swift files — reported "npm (lockfile)" from a
   * package.json whose only job is running rollup over one content-blocking script.
   */
  { manager: 'swift package manager', pattern: /(^|\/)Package\.(swift|resolved)$/ },
  { manager: 'cocoapods', pattern: /(^|\/)Podfile$/ },
];

/**
 * The shallowest manifest wins, and list order only breaks a tie.
 *
 * The list was scanned in order, so the first pattern with any match anywhere decided.
 * A Rust service with a small Go client SDK beside it reported its package manager as
 * "go modules" while the line above it said the backend was axum — two lines of the
 * same report disagreeing about what the project is.
 *
 * Depth is the signal that was already there. A manifest at the root, or nearer it, is
 * the project's; one buried under `sdk/go/` belongs to something the project ships
 * rather than something it is built with.
 */
/**
 * The language each of these manifests builds, so a share can be asked about it.
 *
 * Depth alone decided before, and depth is the wrong question when the shallow
 * manifest belongs to the build tooling: DuckDuckGo iOS keeps a fastlane `Gemfile` at
 * its root and its real Swift manifest five directories down inside the `.xcodeproj`,
 * so the report called a 1194-file iOS application a Ruby project — the same mistake
 * WordPress-iOS produced one layer up, where the fastlane Gemfile was read as the
 * backend.
 */
const MANIFEST_LANGUAGE: Partial<Record<PackageManager, RegExp>> = {
  pub: /\.dart$/,
  composer: /\.php$/,
  'go modules': /\.go$/,
  cargo: /\.rs$/,
  bundler: /\.rb$/,
  mix: /\.exs?$/,
  gradle: /\.(java|kt|kts|scala|groovy)$/,
  maven: /\.(java|kt|kts|scala|groovy)$/,
  nuget: /\.(cs|fs|vb)$/,
  'swift package manager': /\.(swift|m|mm)$/,
  cocoapods: /\.(swift|m|mm)$/,
};

function resolveFromOtherManifests(ctx: DetectContext): PackageManagerResolution | null {
  const files = ctx.files.all;
  const candidates: Array<{ manager: PackageManager; file: string; depth: number; order: number; share: number }> = [];

  OTHER_MANIFESTS.forEach(({ manager, pattern }, order) => {
    for (const file of files) {
      if (!pattern.test(file)) continue;

      const extension = MANIFEST_LANGUAGE[manager];
      candidates.push({
        manager,
        file,
        depth: file.split('/').length,
        order,
        share: extension ? languageShare(ctx, extension) : 0,
      });
    }
  });

  if (candidates.length === 0) return null;

  /**
   * A manifest whose language is really here outranks one that is merely nearer the
   * root. Where none of them clears the line — a repository of configuration, or one
   * whose language this analyzer does not count — the old ordering stands, so nothing
   * that used to resolve stops resolving.
   */
  const substantial = candidates.filter((candidate) => candidate.share >= MINIMUM_LANGUAGE_SHARE);
  const pool = substantial.length > 0 ? substantial : candidates;

  const best = pool.reduce((winner, candidate) =>
    candidate.depth < winner.depth || (candidate.depth === winner.depth && candidate.order < winner.order)
      ? candidate
      : winner,
  );

  return { manager: best.manager, confidence: 'manifest', warnings: [], evidence: [best.file] };
}

function resolveWorkspaceManager(workspace: DetectContext['workspaces'][number]): PackageManagerResolution {
  const warnings: string[] = [];

  if (workspace.lockfiles.includes('pnpm-lock.yaml')) {
    return { manager: 'pnpm', confidence: 'lockfile', warnings, evidence: ['pnpm-lock.yaml'] };
  }
  if (workspace.lockfiles.includes('package-lock.json')) {
    return { manager: 'npm', confidence: 'lockfile', warnings, evidence: ['package-lock.json'] };
  }
  if (workspace.lockfiles.includes('yarn.lock')) {
    return { manager: 'yarn', confidence: 'lockfile', warnings, evidence: ['yarn.lock'] };
  }
  if (workspace.lockfiles.includes('poetry.lock')) {
    return { manager: 'poetry', confidence: 'lockfile', warnings, evidence: ['poetry.lock'] };
  }

  if (workspace.packageJsonPath) {
    warnings.push('package-lock missing');
    return { manager: 'npm', confidence: 'manifest', warnings, evidence: [workspace.packageJsonPath] };
  }

  if (workspace.pyprojectPath) {
    return { manager: 'poetry', confidence: 'manifest', warnings, evidence: [workspace.pyprojectPath] };
  }

  if (workspace.requirementsPath) {
    return { manager: 'pip', confidence: 'manifest', warnings, evidence: [workspace.requirementsPath] };
  }

  return { manager: 'unknown', confidence: 'unknown', warnings, evidence: [] };
}

export async function detectPackageManager(ctx: DetectContext): Promise<{
  result: DetectorResult;
  manager: PackageManager;
  confidence: 'lockfile' | 'manifest' | 'inferred' | 'unknown';
  warnings: string[];
  workspaceManagers: Array<{
    root: string;
    manager: PackageManager;
    confidence: 'lockfile' | 'manifest' | 'inferred' | 'unknown';
    warnings: string[];
  }>;
}> {
  const workspaceManagers = ctx.workspaces.map((ws) => {
    const resolved = resolveWorkspaceManager(ws);
    return {
      root: ws.root,
      manager: resolved.manager,
      confidence: resolved.confidence,
      warnings: resolved.warnings,
      evidence: resolved.evidence,
    };
  });

  const rootWorkspace = workspaceManagers.find((w) => w.root === '.');
  const fromWorkspaces = rootWorkspace ?? workspaceManagers.find((w) => w.manager !== 'unknown');

  // Node and Python first, because the workspace record is built from their manifests and
  // knows which of several it found. Anything else is resolved from the file list.
  const otherManifest = resolveFromOtherManifests(ctx);

  /**
   * A package.json is not always what the project is built with.
   *
   * It wins over every other manifest here because the workspace record is richer, and
   * that was right until it met a repository where Node is the build tooling rather
   * than the product: DuckDuckGo iOS keeps one to run rollup over a single
   * content-blocking script, eight JavaScript files against 1194 Swift ones, and the
   * report said "Package manager: npm (lockfile)".
   *
   * The same share test the backend uses, and for the same reason — one file in twenty
   * is the line below which a language is something the repository contains rather
   * than something it is made of. Only applied when there is another manifest to
   * prefer: a repository whose only manifest is a package.json is an npm repository
   * however little JavaScript it has.
   */
  const nodeOrPythonIsTheProduct =
    languageShare(ctx, /\.(ts|tsx|js|jsx|mjs|cjs|py)$/) >= MINIMUM_LANGUAGE_SHARE;

  const selected = fromWorkspaces
    && fromWorkspaces.manager !== 'unknown'
    && (nodeOrPythonIsTheProduct || !otherManifest)
    ? fromWorkspaces
    : otherManifest ?? fromWorkspaces;

  if (selected) {
    return {
      manager: selected.manager,
      confidence: selected.confidence,
      warnings: selected.warnings,
      workspaceManagers: workspaceManagers.map(({ root, manager, confidence, warnings }) => ({ root, manager, confidence, warnings })),
      result: {
        key: 'meta.packageManager',
        present: selected.manager !== 'unknown',
        evidence: selected.evidence.length > 0
          ? selected.evidence.map((e) => ({ type: 'file', value: e as string }))
          : [{ type: 'note', value: 'no lockfile or manifest detected' }],
        details: {
          manager: selected.manager,
          confidence: selected.confidence,
          warnings: selected.warnings,
          workspaces: workspaceManagers.map(({ root, manager, confidence, warnings }) => ({ root, manager, confidence, warnings })),
        },
      },
    };
  }

  return {
    manager: 'unknown',
    confidence: 'unknown',
    warnings: [],
    workspaceManagers: [],
    result: {
      key: 'meta.packageManager',
      present: false,
      evidence: [{ type: 'note', value: 'no lockfile or manifest detected' }],
      details: { manager: 'unknown', confidence: 'unknown', warnings: [] },
    },
  };
}

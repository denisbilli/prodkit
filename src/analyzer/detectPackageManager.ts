import type { DetectorResult, PackageManager } from './types';
import type { DetectContext } from './detectContext';

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
  { manager: 'bundler', pattern: /(^|\/)Gemfile$/ },
  { manager: 'gradle', pattern: /(^|\/)build\.gradle(\.kts)?$/ },
  { manager: 'maven', pattern: /(^|\/)pom\.xml$/ },
  { manager: 'nuget', pattern: /\.(csproj|fsproj|vbproj)$/i },
];

function resolveFromOtherManifests(files: string[]): PackageManagerResolution | null {
  for (const { manager, pattern } of OTHER_MANIFESTS) {
    const match = files.find((file) => pattern.test(file));
    if (match) return { manager, confidence: 'manifest', warnings: [], evidence: [match] };
  }

  return null;
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
  const selected = fromWorkspaces && fromWorkspaces.manager !== 'unknown'
    ? fromWorkspaces
    : resolveFromOtherManifests(ctx.files.all) ?? fromWorkspaces;

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

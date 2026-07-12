import * as path from 'path';
import { z } from 'zod';
import { scanFiles } from '../utils/fileScanner';
import { readJsonSafe, readTextFileSafe } from '../utils/readTextFileSafe';
import { detectPackageManager } from './detectPackageManager';
import { detectFrontend } from './detectFrontend';
import { detectBackend } from './detectBackend';
import { detectDatabase } from './detectDatabase';
import { detectDocker } from './detectDocker';
import { detectEnv } from './detectEnv';
import { detectAuth } from './detectAuth';
import { detectSecurity } from './detectSecurity';
import { detectUploads } from './detectUploads';
import { detectGdpr } from './detectGdpr';
import { detectBilling } from './detectBilling';
import { detectObservability } from './detectObservability';
import { detectJobs } from './detectJobs';
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
  return /(^|\/)(__tests__|tests?|test-data|fixtures|frontend-example)(\/|$)/i.test(file)
    || /(^|\/)test[-_][^/]+\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file)
    || /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(file);
}

function pickSource(files: string[]): string[] {
  return files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f) && !isTestOrExamplePath(f));
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
  if (npmDeps.electron) frameworks.push('electron');
  if (npmDeps['react-router-dom']) frameworks.push('react-router-dom');
  if (npmDeps.tailwindcss) frameworks.push('tailwindcss');
  return unique(frameworks);
}

function detectWorkspaceBackend(npmDeps: Record<string, string>, pythonDeps: string[]): string[] {
  const frameworks: string[] = [];
  if (npmDeps.express) frameworks.push('express');
  if (pythonDeps.includes('django')) frameworks.push('django');
  if (pythonDeps.includes('fastapi')) frameworks.push('fastapi');
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

  const npmDeps: Record<string, string> = {};
  for (const workspace of workspaces) {
    mergeDeps(npmDeps, workspace.packageJson?.dependencies);
    mergeDeps(npmDeps, workspace.packageJson?.devDependencies);
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
    npmDeps,
    workspaces,
  };

  const [pm, frontend, backend, database, docker, env, auth, security, uploads, gdpr, billing, observability, jobs, deployment] =
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
      detectDeployment(ctx),
    ]);

  const detectors = mergeDetectors([
    pm.result,
    frontend.result,
    backend.result,
    database.result,
    docker,
    ...env,
    ...auth,
    security,
    uploads,
    ...gdpr,
    ...billing,
    observability,
    jobs,
    deployment,
  ]);

  return {
    projectPath: root,
    scannedAt: new Date().toISOString(),
    stack: buildStackInfo({
      frontend: frontend.frameworks,
      backend: backend.frameworks,
      databases: database.databases,
      packageManager: pm.manager,
      packageManagerConfidence: pm.confidence,
      warnings: pm.warnings,
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

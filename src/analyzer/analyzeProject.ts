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
import type { DetectContext } from './detectContext';
import type { PackageJson, ProjectAnalysis } from './types';

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
    .map((l) => l.split(/[<=>~!\[]/)[0].trim().toLowerCase())
    .filter(Boolean);
}

function parsePyproject(text: string | null): string[] {
  if (!text) return [];
  const deps: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('[')) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (match) deps.push(match[1].toLowerCase());
  }
  return deps;
}

function pickSource(files: string[]): string[] {
  return files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f));
}

function pickConfig(files: string[]): string[] {
  return files.filter((f) => /(package\.json|tsconfig|vite\.config|docker|compose|requirements\.txt|pyproject\.toml|settings\.py|\.env)/i.test(f));
}

export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const root = path.resolve(projectPath);
  const allFiles = await scanFiles({ cwd: root });
  const sourceFiles = pickSource(allFiles);
  const configFiles = pickConfig(allFiles);

  const packageJsonRaw = await readJsonSafe<PackageJson>(root, 'package.json');
  const packageJson = packageJsonRaw ? packageJsonSchema.parse(packageJsonRaw) : null;

  const reqTxt = await readTextFileSafe(root, 'requirements.txt');
  const pyproject = await readTextFileSafe(root, 'pyproject.toml');
  const pythonDeps = Array.from(new Set([...parseRequirements(reqTxt), ...parsePyproject(pyproject)]));

  const npmDeps: Record<string, string> = {};
  for (const [k, v] of Object.entries(packageJson?.dependencies ?? {})) npmDeps[k.toLowerCase()] = v;
  for (const [k, v] of Object.entries(packageJson?.devDependencies ?? {})) npmDeps[k.toLowerCase()] = v;

  const ctx: DetectContext = {
    root,
    files: { all: allFiles, source: sourceFiles, config: configFiles },
    packageJson,
    pythonDeps,
    npmDeps,
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
    env,
    ...auth,
    security,
    uploads,
    ...gdpr,
    billing,
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
      files: allFiles,
    }),
    packageJson,
    pythonDeps,
    files: {
      all: allFiles,
      source: sourceFiles,
      config: configFiles,
    },
    detectors,
  };
}

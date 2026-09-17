import { LANGUAGES } from './catalogue';
import type { DetectorResult, StackInfo } from './types';

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

export function deriveLanguages(files: string[]): string[] {
  // Read from the catalogue rather than from three hand-written lines. It knew about
  // TypeScript, JavaScript and Python only, so a Go service reported no languages at
  // all while the README listed twelve.
  return unique(LANGUAGES.filter(({ extensions }) => files.some((file) => extensions.test(file))).map(({ id }) => id));
}

export function buildStackInfo(input: {
  frontend: string[];
  backend: string[];
  databases: string[];
  dataPlatforms?: string[];
  orms?: string[];
  packageManager: StackInfo['packageManager'];
  packageManagerConfidence: StackInfo['packageManagerConfidence'];
  warnings: string[];
  workspaces: StackInfo['workspaces'];
  files: string[];
}): StackInfo {
  return {
    frontend: unique(input.frontend),
    backend: unique(input.backend),
    databases: unique(input.databases),
    dataPlatforms: unique(input.dataPlatforms ?? []),
    orms: unique(input.orms ?? []),
    packageManager: input.packageManager,
    packageManagerConfidence: input.packageManagerConfidence,
    warnings: unique(input.warnings),
    workspaces: input.workspaces,
    languages: deriveLanguages(input.files),
  };
}

export function mergeDetectors(results: DetectorResult[]): Record<string, DetectorResult> {
  const out: Record<string, DetectorResult> = {};
  for (const r of results) out[r.key] = r;
  return out;
}

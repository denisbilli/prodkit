import type { DetectorResult, PackageManager } from './types';
import type { DetectContext } from './detectContext';

export async function detectPackageManager(ctx: DetectContext): Promise<{
  result: DetectorResult;
  manager: PackageManager;
  confidence: 'lockfile' | 'manifest' | 'inferred' | 'unknown';
  warnings: string[];
}> {
  const warnings: string[] = [];
  const map: Array<{ file: string; pm: PackageManager }> = [
    { file: 'pnpm-lock.yaml', pm: 'pnpm' },
    { file: 'package-lock.json', pm: 'npm' },
    { file: 'yarn.lock', pm: 'yarn' },
    { file: 'poetry.lock', pm: 'poetry' },
    { file: 'pyproject.toml', pm: 'python' },
    { file: 'requirements.txt', pm: 'pip' },
  ];
  for (const { file, pm } of map) {
    if (ctx.files.all.includes(file)) {
      return {
        manager: pm,
        confidence: 'lockfile',
        warnings,
        result: {
          key: 'meta.packageManager',
          present: true,
          evidence: [{ type: 'file', value: file }],
          details: { manager: pm, confidence: 'lockfile', warnings },
        },
      };
    }
  }

  if (ctx.files.all.includes('package.json')) {
    warnings.push('package-lock missing');
    return {
      manager: 'npm',
      confidence: 'manifest',
      warnings,
      result: {
        key: 'meta.packageManager',
        present: true,
        evidence: [{ type: 'file', value: 'package.json' }],
        details: { manager: 'npm', confidence: 'manifest', warnings },
      },
    };
  }

  return {
    manager: 'unknown',
    confidence: 'unknown',
    warnings,
    result: {
      key: 'meta.packageManager',
      present: false,
      evidence: [{ type: 'note', value: 'no lockfile or manifest detected' }],
      details: { manager: 'unknown', confidence: 'unknown', warnings },
    },
  };
}

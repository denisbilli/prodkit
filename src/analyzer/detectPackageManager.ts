import type { DetectorResult, PackageManager } from './types';
import type { DetectContext } from './detectContext';

export async function detectPackageManager(ctx: DetectContext): Promise<{
  result: DetectorResult;
  manager: PackageManager;
}> {
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
        result: {
          key: 'meta.packageManager',
          present: true,
          evidence: [{ type: 'file', value: file }],
          details: { manager: pm },
        },
      };
    }
  }
  return {
    manager: 'unknown',
    result: {
      key: 'meta.packageManager',
      present: false,
      evidence: [{ type: 'note', value: 'no lockfile or manifest detected' }],
    },
  };
}

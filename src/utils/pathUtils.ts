import * as path from 'path';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function resolveProjectPath(input: string): string {
  return path.resolve(process.cwd(), input);
}

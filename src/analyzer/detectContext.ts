import type { PackageJson, ProjectFiles } from './types';

export interface WorkspaceManifest {
  root: string;
  packageJsonPath?: string;
  packageJson?: PackageJson | null;
  requirementsPath?: string;
  requirementsDeps: string[];
  pyprojectPath?: string;
  pyprojectDeps: string[];
  lockfiles: string[];
}

export interface DetectContext {
  root: string;
  files: ProjectFiles;
  packageJson: PackageJson | null;
  pythonDeps: string[]; // lowercase names
  /** Lowercased combined dependency map (deps + devDeps). */
  npmDeps: Record<string, string>;
  workspaces: WorkspaceManifest[];
}

export function hasDep(ctx: DetectContext, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ctx.npmDeps, name.toLowerCase());
}

export function hasAnyDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((n) => hasDep(ctx, n));
}

export function hasPyDep(ctx: DetectContext, name: string): boolean {
  return ctx.pythonDeps.includes(name.toLowerCase());
}

export function hasAnyPyDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((n) => hasPyDep(ctx, n));
}

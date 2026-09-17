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
  /**
   * Composer requirements, lowercase, vendor/package as written.
   *
   * Added because a published PHP application in the test corpus was reported with a
   * backend of "unknown": nothing here read composer.json, so the framework it is
   * built on was invisible while 57 source files sat next to it.
   */
  phpDeps: string[];
  /** Module paths from go.mod, lowercase. */
  goDeps: string[];
  /** Gem names from the Gemfile, lowercase. */
  rubyDeps: string[];
  /** PackageReference and FrameworkReference names from .csproj, lowercase. */
  dotnetDeps: string[];
  /** Whether any project file declares the web SDK, which no dependency reveals. */
  dotnetWebSdk: boolean;
  /** Package names from pubspec.yaml, lowercase. */
  dartDeps: string[];
  /** Gradle coordinates as `group:artifact`, without the version, lowercase. */
  gradleDeps: string[];
  /** Swift packages as `owner/repo`, and CocoaPods names, lowercase. */
  swiftDeps: string[];
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

/**
 * One implementation for every manifest.
 *
 * Python and PHP each had their own identical pair of helpers. Go and Ruby would have
 * made four, which is where copying stops being cheaper than sharing — and the next
 * language after that would have copied whichever of the four it happened to land next
 * to, including any drift.
 */
function hasAnyIn(list: string[], names: string[]): string[] {
  return names.filter((name) => list.includes(name.toLowerCase()));
}

export function hasPhpDep(ctx: DetectContext, name: string): boolean {
  return hasAnyIn(ctx.phpDeps, [name]).length > 0;
}

export function hasAnyPhpDep(ctx: DetectContext, names: string[]): string[] {
  return hasAnyIn(ctx.phpDeps, names);
}

/**
 * Go module paths are matched on a suffix: a manifest says
 * `github.com/gin-gonic/gin`, and a rule should be able to ask for `gin-gonic/gin`
 * without repeating the host, which can differ for forks and mirrors.
 */
export function hasAnyGoDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) =>
    ctx.goDeps.some((dep) => dep === name.toLowerCase() || dep.endsWith(`/${name.toLowerCase()}`))
  );
}

export function hasAnyRubyDep(ctx: DetectContext, names: string[]): string[] {
  return hasAnyIn(ctx.rubyDeps, names);
}

/**
 * .NET package names are matched on a prefix: a project references
 * `Npgsql.EntityFrameworkCore.PostgreSQL`, and a rule should be able to ask for
 * `Npgsql` without listing every provider package that starts with it.
 */
export function hasAnyGradleDep(ctx: DetectContext, names: string[]): string[] {
  // Substring rather than equality: a coordinate is `androidx.room:room-runtime`, and
  // a rule asks about `androidx.room` without wanting to name every artifact in it.
  const wanted = names.map((name) => name.toLowerCase());
  return ctx.gradleDeps.filter((dep) => wanted.some((name) => dep.includes(name)));
}

export function hasAnySwiftDep(ctx: DetectContext, names: string[]): string[] {
  const wanted = names.map((name) => name.toLowerCase());
  return ctx.swiftDeps.filter((dep) => wanted.some((name) => dep.includes(name)));
}

export function hasAnyDartDep(ctx: DetectContext, names: string[]): string[] {
  return hasAnyIn(ctx.dartDeps, names);
}

export function hasAnyDotnetDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) =>
    ctx.dotnetDeps.some((dep) => dep === name.toLowerCase() || dep.startsWith(`${name.toLowerCase()}.`))
  );
}

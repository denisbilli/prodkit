import type { PackageJson, ProjectFiles } from './types';

export interface WorkspaceManifest {
  root: string;
  packageJsonPath?: string;
  packageJson?: PackageJson | null;
  requirementsPath?: string;
  requirementsDeps: string[];
  pyprojectPath?: string;
  pyprojectDeps: string[];
  /** Of those, the ones installed by default rather than offered as an extra. */
  pyprojectRuntimeDeps: string[];
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
  /** Crate names from Cargo.toml, lowercase. */
  rustDeps: string[];
  /** Packages named in mix.exs. */
  elixirDeps: string[];
  /** The ones without an `only:` option, so the ones the product ships. */
  runtimeElixirDeps: string[];
  /** Of those, the ones the product ships with rather than only builds and tests with. */
  runtimeRustDeps: string[];
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
  /**
   * Dependencies the product ships with, without the ones it only builds and tests with.
   *
   * `npmDeps` merges both, which is right for almost every question — React in
   * devDependencies still means React — and wrong for one: a server framework. axios
   * declares `express` in devDependencies to run a test server, and was read as having
   * a backend, which kept it out of the `library` profile it plainly belongs to.
   */
  runtimeNpmDeps: Record<string, string>;
  /**
   * Python packages installed by default, without the extras.
   *
   * A library that integrates with FastAPI declares it under
   * `[project.optional-dependencies]`, and nobody installing the library gets a web
   * server. Used for the same single question as `runtimeNpmDeps`.
   */
  runtimePythonDeps: string[];
  workspaces: WorkspaceManifest[];
}

export function hasDep(ctx: DetectContext, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ctx.npmDeps, name.toLowerCase());
}

/**
 * Declared as something the product runs on, not merely something present.
 *
 * Used for server frameworks only. A test server in devDependencies is a fixture; the
 * question "does this repository serve requests" is answered by what it ships.
 */
export function hasRuntimeDep(ctx: DetectContext, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ctx.runtimeNpmDeps, name.toLowerCase());
}

/** The Python counterpart: shipped, not merely offered as an extra. */
export function hasRuntimePyDep(ctx: DetectContext, name: string): boolean {
  return ctx.runtimePythonDeps.includes(name.toLowerCase());
}

export function hasAnyDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((n) => hasDep(ctx, n));
}

export function hasPyDep(ctx: DetectContext, name: string): boolean {
  return ctx.pythonDeps.includes(name.toLowerCase());
}

export function hasAnyRustDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) => ctx.rustDeps.includes(name.toLowerCase()));
}

export function hasAnyElixirDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) => ctx.elixirDeps.includes(name.toLowerCase()));
}

/** The Elixir counterpart: shipped, not merely declared. */
export function hasAnyRuntimeElixirDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) => ctx.runtimeElixirDeps.includes(name.toLowerCase()));
}

/** The Rust counterpart of `hasRuntimeDep`: shipped, not merely present. */
export function hasAnyRuntimeRustDep(ctx: DetectContext, names: string[]): string[] {
  return names.filter((name) => ctx.runtimeRustDeps.includes(name.toLowerCase()));
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

/**
 * The names this tool can put to how a project declares its dependencies.
 *
 * It held seven, all of them Node or Python, so a Flutter application with a
 * `pubspec.yaml` in its root reported "Package manager: unknown (unknown)" — in the
 * same summary that had just read that file to identify Flutter. Five of the
 * seventy-eight repositories in the verification corpus were in that position, across
 * Dart, PHP, Kotlin and C#.
 *
 * Only managers whose manifest this analyzer actually reads are named here. A name it
 * cannot back with a parsed file would be a guess from a filename.
 */
export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'pip'
  | 'poetry'
  | 'python'
  | 'pub'
  | 'composer'
  | 'go modules'
  | 'bundler'
  | 'gradle'
  | 'maven'
  | 'nuget'
  | 'unknown';

export type PackageManagerConfidence = 'lockfile' | 'manifest' | 'inferred' | 'unknown';

export interface WorkspaceStack {
  root: string;
  frontend: string[];
  backend: string[];
  databases: string[];
  packageManager: PackageManager;
  packageManagerConfidence: PackageManagerConfidence;
  warnings: string[];
}

export interface StackInfo {
  frontend: string[]; // e.g. ['react', 'vite', 'tailwind']
  backend: string[]; // e.g. ['express'] or ['django']
  databases: string[]; // ['postgres', 'redis']
  /**
   * Hosted data services: ['supabase'], ['firebase']. Separate from `databases`,
   * which holds the engine — Supabase appears in both, as 'supabase' here and
   * 'postgres' there, because it is both.
   */
  dataPlatforms: string[];
  orms: string[]; // ['prisma', 'drizzle']
  languages: string[]; // ['typescript', 'javascript', 'python']
  packageManager: PackageManager;
  packageManagerConfidence: PackageManagerConfidence;
  warnings: string[];
  workspaces: WorkspaceStack[];
}

export interface DetectorEvidence {
  /**
   * `search` records a look that came back empty.
   *
   * A report about a missing capability has nothing to point at, so eleven findings of
   * thirty-two in a real report carried the line "no direct evidence captured" — which
   * reads like "we did not look" rather than "we looked and it is not there". The
   * reader cannot tell the difference, and an independent review said so.
   *
   * The evidence for an absence is the search that found nothing, and the detectors
   * already know what they searched for. Saying it turns an assertion into something
   * the reader can check and disagree with.
   */
  type: 'file' | 'dependency' | 'snippet' | 'note' | 'search';
  value: string;
  file?: string;
  line?: number;
  /**
   * Which claim this line actually supports.
   *
   * A detector that answers several questions used to hand its whole evidence array to
   * every finding derived from it, so the same four `SECURE_HSTS_SECONDS` lines from a
   * Django settings file were cited as the evidence for missing rate limiting, for
   * CORS, for DEBUG and for cookie flags. A reader who opens "no rate limiting" and
   * finds an HSTS line stops believing the rest of the report, and an independent
   * review of a real project said exactly that.
   *
   * Optional: evidence with no claim is general to its detector and still shown to
   * everything, which is what every untagged detector relies on.
   */
  claim?: string;
}

export interface DetectorResult {
  /** Stable feature key, e.g. 'security.helmet' */
  key: string;
  present: boolean;
  /** When present is true: was the implementation complete? */
  complete?: boolean;
  evidence: DetectorEvidence[];
  details?: Record<string, unknown>;
}

export interface ProjectFiles {
  /** All scanned files (relative, posix-normalized). */
  all: string[];
  /** Source files (js/ts/py). */
  source: string[];
  /** Config files. */
  config: string[];
}

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [k: string]: unknown;
}

export interface ProjectAnalysis {
  projectPath: string;
  scannedAt: string;
  stack: StackInfo;
  packageJson: PackageJson | null;
  pythonDeps: string[];
  workspaceStacks: WorkspaceStack[];
  files: ProjectFiles;
  detectors: Record<string, DetectorResult>;
}

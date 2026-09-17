export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'pip'
  | 'poetry'
  | 'python'
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
  type: 'file' | 'dependency' | 'snippet' | 'note';
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

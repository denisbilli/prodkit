export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'pip'
  | 'poetry'
  | 'python'
  | 'unknown';

export type PackageManagerConfidence = 'lockfile' | 'manifest' | 'inferred' | 'unknown';

export interface StackInfo {
  frontend: string[]; // e.g. ['react', 'vite', 'tailwind']
  backend: string[]; // e.g. ['express'] or ['django']
  databases: string[]; // ['postgres', 'redis']
  languages: string[]; // ['typescript', 'javascript', 'python']
  packageManager: PackageManager;
  packageManagerConfidence: PackageManagerConfidence;
  warnings: string[];
}

export interface DetectorEvidence {
  type: 'file' | 'dependency' | 'snippet' | 'note';
  value: string;
  file?: string;
  line?: number;
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
  files: ProjectFiles;
  detectors: Record<string, DetectorResult>;
}

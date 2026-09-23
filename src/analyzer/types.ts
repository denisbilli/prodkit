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
  | 'cargo'
  | 'bundler'
  | 'gradle'
  | 'maven'
  | 'nuget'
  | 'swift package manager'
  | 'cocoapods'
  | 'mix'
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
  /**
   * For a `search`: whether it read the source text or only the list of file names.
   *
   * "No Dockerfile" is true of a repository in any language, because the file list is
   * readable whatever is inside the files. "No security headers" is a claim about what
   * the code does, and a language this analyzer cannot read cannot answer it. Only the
   * second kind is withdrawn where most of the repository went unread.
   */
  overFileNames?: boolean;
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
  /**
   * The question behind this signal could not be asked.
   *
   * `present: false` has carried two meanings that a reader would never confuse: "I
   * looked and it is not there", and "I could not look". The second happens whenever a
   * signal rests on the optional TypeScript compiler and the compiler is absent — the
   * ordinary case for `npx prodkit` against somebody else's repository.
   *
   * Measured by hiding `node_modules/typescript` and re-running the fixture corpus: 7
   * of 133 repositories answer differently, and `segreto-in-italiano` reports a
   * hardcoded signing secret as `passed` rather than `missing`. A verdict of "fine" is
   * the one direction blindness must never produce.
   *
   * Set it only where the missing reader can change the answer, and only alongside
   * `present: false`: a signal that found the thing found it, whatever else went
   * unasked. Consumers turn it into `unknown`, which already means "not assessed"
   * everywhere downstream — the plan skips it and the score leaves it out.
   */
  unanswered?: boolean;
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
  /**
   * HTML pages the product serves, without the ones under test or example paths.
   *
   * A consent banner is embedded as a script tag, so the consent search reads HTML — and
   * read it from `all`, test data included. mealie keeps scraped recipe pages from other
   * people's sites under `tests/data/html/` to test its parser; they carry those sites'
   * OneTrust and Funding Choices scripts, and mealie was credited with a consent banner it
   * does not have. The same test-path rule that keeps tests out of `source` applies here.
   */
  pages: string[];
  /**
   * Files in languages nothing here can read, counted by language.
   *
   * The warning built from this has existed for a while and said the right thing —
   * "1257 Elixir files were not analysed: this reading covers only part of the
   * repository" — while the same report named a profile with high confidence and scored
   * it 85. Exposing the count rather than only the sentence lets the reading take its
   * own warning into account instead of printing it beside a verdict that ignores it.
   */
  unreadable: Array<{ language: string; files: number }>;
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
  /**
   * Whether the optional TypeScript compiler was there while the detectors ran.
   *
   * Carried on the analysis rather than asked for at report time, because it is a fact
   * about this reading and not about the machine printing it: the report's claim of how
   * deeply it read has to match what the detectors were actually able to do.
   */
  parsedStructure: boolean;
}

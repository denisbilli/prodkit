import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { hasAnyDep, hasAnyPyDep } from './detectContext';

/**
 * Whether a project is fit to be installed and depended on by someone else.
 *
 * Twenty-five of the seventy-seven repositories in the verification corpus received no
 * profile at all, and a large share of them were libraries and command-line tools:
 * Meta's llama3 reference implementation, a Markdown converter, a photo editor, this
 * project's own AI package. Every profile here assumed a running service with users, so
 * the most common kind of code on a developer's disk had no category — and a product
 * that sells "judged for the type of product it is" said nothing about what they were.
 *
 * What matters for a library is not what matters for a service. Nobody signs in to a
 * package. What decides whether it is fit to publish is whether it says what it is,
 * whether it can be imported, whether its licence permits use at all, and whether
 * anything proves it works.
 */

const LICENSE_FILE = /(^|\/)(LICEN[CS]E|COPYING)(\.[a-z]+)?$/i;
const README_FILE = /(^|\/)README(\.[a-z]+)?$/i;
const CI_FILE = /(^|\/)(\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|\.travis\.yml|\.woodpecker\.ya?ml)$/i;

/**
 * A test, as opposed to a file with "test" in its name.
 *
 * Deliberately not `/test/`: `src/latest.ts` and `contest.py` both contain it, and a
 * repository does not get credit for a word.
 */
const TEST_FILE = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|[^/]+_test\.(py|go|rb)$/i;

function collect(files: string[], pattern: RegExp, limit = 3): string[] {
  return files.filter((file) => pattern.test(file)).slice(0, limit);
}


/**
 * Generators whose whole job is to build a documentation website.
 *
 * A package with a docs site in its repository was being read as whatever that site is
 * built with. zod is a validation library and came back a client application; vite came
 * back a client application; ruff — a linter written in Rust, with every packaging
 * signal present — came back a static site, read from its React playground. Five public
 * libraries out of five, all for this reason.
 *
 * The site that documents a product is not the product.
 */
const DOCS_GENERATORS = [
  '@docusaurus/core', 'vitepress', 'nextra', '@astrojs/starlight', 'vuepress', 'docz',
  'docsify-cli', 'mintlify', '@11ty/eleventy', 'mkdocs', 'mkdocs-material', 'sphinx',
];

/**
 * Where a documentation site lives when it has no generator of its own.
 *
 * A hand-built docs site or a playground sits in a directory named for what it is. This
 * is only consulted for the front-end files: a `docs/` folder full of Markdown says
 * nothing either way, and a repository whose application happens to live under `www/`
 * is not caught because the question asked is whether *every* front-end file is in one
 * of these.
 */
const DOCS_DIRECTORIES = /^(docs?|website|playground|examples?|demo|www)\//i;

const FRONTEND_FILE = /\.(tsx|jsx|vue|svelte|astro)$/;

export async function detectPackaging(ctx: DetectContext): Promise<DetectorResult[]> {
  const all = ctx.files.all;

  /**
   * Whether the front end in this repository is its documentation rather than its product.
   *
   * Two ways to know, and both have to be about the front end specifically. A docs
   * generator in the dependencies says so outright. Failing that, every front-end file
   * living under a directory named for documentation says the same thing more quietly —
   * and *every* matters: one component under `examples/` beside an application is an
   * example, while an application that is entirely under `examples/` does not exist.
   */
  const docsGenerators: string[] = [...hasAnyDep(ctx, DOCS_GENERATORS), ...hasAnyPyDep(ctx, DOCS_GENERATORS)];
  const frontendFiles = ctx.files.source.filter((file) => FRONTEND_FILE.test(file));
  const frontendAllInDocs = frontendFiles.length > 0
    && frontendFiles.every((file) => DOCS_DIRECTORIES.test(file));
  const documentationSite = docsGenerators.length > 0 || frontendAllInDocs;

  const licenseFiles = collect(all, LICENSE_FILE);
  const declaredLicense = typeof (ctx.packageJson as { license?: unknown } | null)?.license === 'string';
  const licenseEvidence: DetectorEvidence[] = [
    ...licenseFiles.map((file) => ({ type: 'file' as const, value: file, file })),
    ...(declaredLicense ? [{ type: 'note' as const, value: 'a license field in package.json' }] : []),
  ];

  const readmeFiles = collect(all, README_FILE);
  /**
   * A README that is only a title is not documentation.
   *
   * The threshold is deliberately low — enough prose to say what the thing is and how
   * to install it — because the check is "did anyone write anything", not "is it good".
   */
  let readmeLength = 0;
  for (const file of readmeFiles) {
    const raw = await readTextFileSafe(ctx.root, file);
    readmeLength = Math.max(readmeLength, (raw ?? '').trim().length);
  }

  const ciFiles = collect(all, CI_FILE);
  const testFiles = all.filter((file) => TEST_FILE.test(file));

  /**
   * A test runner that something actually invokes.
   *
   * Test files with no way to run them is a different state from a project with a
   * `npm test` that a reader can type, so the two are separated: files alone are
   * `partial`, files plus a runner are `complete`.
   */
  const scripts = (ctx.packageJson?.scripts ?? {}) as Record<string, string>;
  const hasTestScript = typeof scripts.test === 'string' && !/no test specified/i.test(scripts.test);
  const hasPyTestRunner = all.some((f) => /(^|\/)(pytest\.ini|tox\.ini|noxfile\.py)$/i.test(f))
    || ctx.pythonDeps.some((d) => d === 'pytest' || d === 'nose2' || d === 'unittest2');

  /**
   * Whether the package can be installed and imported.
   *
   * `main`, `module`, `exports` and `bin` are the four ways a Node package says where
   * it starts; `types` is how a TypeScript consumer finds it. A Python package says the
   * same thing through `[project.scripts]` or a `packages` argument in setup.py.
   */
  const pkg = (ctx.packageJson ?? {}) as Record<string, unknown>;
  const nodeEntrypoints = ['main', 'module', 'exports', 'bin'].filter((key) => pkg[key] !== undefined);
  const hasTypes = pkg.types !== undefined || pkg.typings !== undefined;
  const isPrivate = pkg.private === true;

  let pythonEntrypoints = false;
  for (const file of all.filter((f) => /(^|\/)(pyproject\.toml|setup\.py|setup\.cfg)$/i.test(f)).slice(0, 4)) {
    const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (/\[project\.scripts\]|\[project\.gui-scripts\]|console_scripts|entry_points|packages\s*=|\[project\]/i.test(raw)) {
      pythonEntrypoints = true;
    }
  }

  const hasManifest = ctx.packageJson !== null
    || all.some((f) => /(^|\/)(pyproject\.toml|setup\.py|go\.mod|Cargo\.toml|composer\.json|\w+\.gemspec)$/i.test(f));

  /**
   * A name and a version. Without them nothing can depend on this, whatever else it
   * does right.
   */
  const named = typeof pkg.name === 'string' && typeof pkg.version === 'string';
  const described = typeof pkg.description === 'string' && (pkg.description as string).length > 0;
  const sourced = pkg.repository !== undefined || pkg.homepage !== undefined;

  const entrypointCount = nodeEntrypoints.length + (pythonEntrypoints ? 1 : 0);

  return [
    {
      key: 'packaging.manifest',
      present: hasManifest,
      complete: hasManifest && (named || pythonEntrypoints),
      evidence: hasManifest ? [{ type: 'note', value: named ? 'a manifest with a name and a version' : 'a package manifest' }] : [],
      details: { named, described, sourced, private: isPrivate },
    },
    {
      key: 'packaging.entrypoints',
      present: entrypointCount > 0,
      complete: entrypointCount > 0 && (hasTypes || pythonEntrypoints),
      evidence: [
        ...nodeEntrypoints.map((key) => ({ type: 'note' as const, value: `package.json declares "${key}"` })),
        ...(pythonEntrypoints ? [{ type: 'note' as const, value: 'a Python package or console script declaration' }] : []),
        ...(hasTypes ? [{ type: 'note' as const, value: 'TypeScript types are declared' }] : []),
      ],
      details: { nodeEntrypoints, hasTypes, pythonEntrypoints },
    },
    {
      key: 'packaging.license',
      // A licence file and a declared licence say the same thing; either alone is an
      // answer, and a reader who has one does not need the other to use the code.
      present: licenseFiles.length > 0 || declaredLicense,
      complete: licenseFiles.length > 0 && declaredLicense,
      evidence: licenseEvidence,
      details: { files: licenseFiles.length, declared: declaredLicense },
    },
    {
      /**
       * A site that documents the product, as distinct from the product.
       *
       * Its own detector rather than a flag on the stack, because it is evidence a
       * reader can check: either a generator in the manifest or the directory every
       * front-end file sits in.
       */
      key: 'docs.site',
      present: documentationSite,
      evidence: docsGenerators.length > 0
        ? docsGenerators.map((dep) => ({ type: 'dependency' as const, value: dep }))
        : frontendFiles.slice(0, 5).map((file) => ({ type: 'file' as const, value: file, file })),
      details: { generators: docsGenerators, frontendFiles: frontendFiles.length, allUnderDocs: frontendAllInDocs },
    },
    {
      key: 'docs.readme',
      present: readmeFiles.length > 0,
      complete: readmeLength > 400,
      evidence: readmeFiles.map((file) => ({ type: 'file' as const, value: `${file} (${readmeLength} characters)`, file })),
      details: { length: readmeLength },
    },
    {
      key: 'quality.tests',
      present: testFiles.length > 0,
      complete: testFiles.length > 0 && (hasTestScript || hasPyTestRunner),
      evidence: [
        ...testFiles.slice(0, 3).map((file) => ({ type: 'file' as const, value: file, file })),
        ...(hasTestScript ? [{ type: 'note' as const, value: 'an "npm test" script' }] : []),
        ...(hasPyTestRunner ? [{ type: 'note' as const, value: 'a Python test runner' }] : []),
      ],
      details: { files: testFiles.length, runner: hasTestScript || hasPyTestRunner },
    },
    {
      key: 'quality.ci',
      present: ciFiles.length > 0,
      complete: ciFiles.length > 0 && testFiles.length > 0,
      evidence: ciFiles.map((file) => ({ type: 'file' as const, value: file, file })),
      details: { files: ciFiles.length },
    },
  ];
}

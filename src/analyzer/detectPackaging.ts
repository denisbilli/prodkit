import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { readJsonSafe } from '../utils/readTextFileSafe';
import { evidenceOrSearch } from './absenceEvidence';

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
  // zod's docs are Fumadocs on Next.js, the generator most new TypeScript libraries reach for.
  'fumadocs-core', 'fumadocs-ui',
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
/*
 * With a version after it, too: a library that rewrote its docs keeps the old site
 * beside the new one, and `colinhacks/zod` has `packages/docs/` and `packages/docs-v3/`.
 * `docs?\/` wanted the slash straight after, so two `index.html` files under
 * `docs-v3/` made zod's front end its product, and a TypeScript library was inferred as
 * a client application at high confidence. And `docs_src/`, where FastAPI keeps the code
 * every page of its documentation runs.
 */
export const DOCS_DIRECTORIES = /(^|\/)(docs?|website|playground|examples?|demo|www)(?:[-_.]?v?\d+|[-_]src)?\//i;

/**
 * `.html` belongs here because the front-end fact counts it.
 *
 * The front-end detector falls back to "a page is a front end" and counts `.html`
 * files, so a library whose only pages are its documentation comes out with a front
 * end. This test — is every front-end file under a docs directory — looked at
 * framework extensions only, so it could not see those pages and could not answer
 * yes. Moq's documentation is plain HTML under `docs/`, and Moq was profiled as a
 * static site: a mocking library with 243 C# files, judged on its Jekyll theme.
 */
const FRONTEND_FILE = /\.(tsx|jsx|vue|svelte|astro|html?)$/;


/**
 * The published package inside a workspace, if there is one.
 *
 * Named, versioned, not private — the three things npm requires to accept a publish.
 * A workspace full of private example applications has none, and gets the honest answer
 * that nothing here is published.
 */
async function findPublishedMember(
  ctx: DetectContext,
): Promise<{ path: string; manifest: Record<string, unknown> } | null> {
  const members = ctx.files.all
    .filter((file) => /(^|\/)package\.json$/.test(file) && file !== 'package.json')
    .slice(0, 60);

  for (const file of members) {
    const manifest = await readJsonSafe<Record<string, unknown>>(ctx.root, file);
    if (!manifest) continue;

    const named = typeof manifest.name === 'string' && typeof manifest.version === 'string';
    if (named && manifest.private !== true) return { path: file, manifest };
  }

  return null;
}

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
  /**
   * The manifest that declares the licence is not always the one at the root.
   *
   * This read `ctx.packageJson.license` and nothing else, so excalidraw — a LICENSE file
   * at the root and `"license": "MIT"` in every one of its published packages — came out
   * `partial`, told to declare a licence it declares nine times. Its root manifest is
   * `private: true`: it is the workspace, not a package, and npm would refuse to publish
   * it. A manifest that is never published has no licence field to be missing.
   *
   * So: any workspace manifest naming a licence answers it, and a private root is not
   * asked for one. The LICENSE file is still required either way — the field alone
   * tells a human nothing about the terms.
   *
   * `private: true` excuses the missing field; it does not supply a licence. A
   * repository with a private root, no LICENSE and no field anywhere is unlicensed, and
   * saying otherwise would be the one direction this must never move a verdict.
   */
  const workspaceManifests = all.filter(
    (file) => /(^|\/)package\.json$/.test(file) && !/(^|\/)node_modules\//.test(file) && file !== 'package.json',
  );
  let workspaceLicense: string | undefined;
  for (const file of workspaceManifests.slice(0, 50)) {
    const manifest = await readJsonSafe<{ license?: unknown }>(ctx.root, file);
    if (typeof manifest?.license === 'string') {
      workspaceLicense = file;
      break;
    }
  }
  const rootIsPrivate = (ctx.packageJson as { private?: unknown } | null)?.private === true;
  const rootLicense = typeof (ctx.packageJson as { license?: unknown } | null)?.license === 'string';
  /**
   * The other ecosystems' manifests, which name a licence in their own fields.
   *
   * The search above read package.json only, while the evidence it prints on a miss
   * already promised "a license classifier in pyproject.toml". `encode/httpx` declares
   * `license = "BSD-3-Clause"` and the OSI classifier, beside its LICENSE.md, and was
   * told its licence is only half declared. PEP 621's `license =` and the `License ::`
   * classifier, `setup.cfg` and `setup.py`, Cargo's `license =`, a gemspec's `.license =`
   * and NuGet's `PackageLicenseExpression` are the same field under other names.
   */
  const otherManifests = all.filter((file) =>
    /(^|\/)(pyproject\.toml|setup\.cfg|setup\.py|Cargo\.toml)$|\.(gemspec|csproj)$/.test(file)
    && !/(^|\/)(node_modules|vendor|target)\//.test(file),
  ).slice(0, 30);
  let manifestLicense: string | undefined;
  for (const file of otherManifests) {
    const text = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (/^\s*license\s*=|License ::|\.license\s*=|<PackageLicense(?:Expression|File)>|\blicense\s*=\s*["']/m.test(text)) {
      manifestLicense = file;
      break;
    }
  }
  const namesALicense = rootLicense || workspaceLicense !== undefined || manifestLicense !== undefined;
  /**
   * go.mod has no licence field, so a Go module has nothing to declare it in: pkg.go.dev
   * reads the LICENSE file and nothing else. The same reasoning that excuses a private
   * npm root — a manifest with no licence field cannot be missing one — and the file is
   * still required.
   */
  const goModuleOnly = all.includes('go.mod') && !ctx.packageJson && otherManifests.length === 0;
  const declaredLicense = namesALicense || ((rootIsPrivate || goModuleOnly) && licenseFiles.length > 0);
  const licenseEvidence: DetectorEvidence[] = [
    ...licenseFiles.map((file) => ({ type: 'file' as const, value: file, file })),
    ...(rootLicense ? [{ type: 'note' as const, value: 'a license field in package.json' }] : []),
    ...(workspaceLicense ? [{ type: 'note' as const, value: `a license field in ${workspaceLicense}`, file: workspaceLicense }] : []),
    ...(manifestLicense ? [{ type: 'note' as const, value: `a licence declared in ${manifestLicense}`, file: manifestLicense }] : []),
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
   * The toolchains that run tests with nothing to configure.
   *
   * `go test`, `cargo test`, `mix test` and a Gradle or Maven build's `test` task exist the
   * moment the manifest does; there is no script to write. `spf13/cobra` has `_test.go`
   * files beside every source file and was told its tests had no runner, which is true of
   * no Go project anywhere.
   */
  const hasToolchainTestRunner = all.some((f) => /(^|\/)(go\.mod|Cargo\.toml|mix\.exs|build\.gradle(\.kts)?|pom\.xml)$/.test(f));

  /**
   * Whether the package can be installed and imported.
   *
   * `main`, `module`, `exports` and `bin` are the four ways a Node package says where
   * it starts; `types` is how a TypeScript consumer finds it. A Python package says the
   * same thing through `[project.scripts]` or a `packages` argument in setup.py.
   */
  const rootPkg = (ctx.packageJson ?? {}) as Record<string, unknown>;

  /**
   * In a monorepo the root manifest is not the package.
   *
   * zod's root is `private: true` with `workspaces: ["packages/*"]`, no name, no version
   * and no entry point; `zod` itself is `packages/zod/package.json`, named, versioned
   * and exported. Reading only the root made the most downloaded validation library on
   * npm a repository that publishes nothing — and vite the same.
   *
   * The published package is looked for among the members, and the first one that is
   * named, versioned and not private is what this repository ships. Its manifest is
   * what the evidence points at, so a reader can open the file the claim rests on rather
   * than a root that says nothing.
   */
  /**
   * Three ways to say the same thing.
   *
   * npm and yarn declare workspaces inside `package.json`; pnpm puts them in
   * `pnpm-workspace.yaml`. Reading only the first meant vite — whose root has no
   * `workspaces` field at all — was never looked into, and came back as a repository
   * that publishes nothing.
   */
  const workspaceRoot = Array.isArray(rootPkg.workspaces)
    || (typeof rootPkg.workspaces === 'object' && rootPkg.workspaces !== null)
    || all.some((file) => /^(pnpm-workspace\.yaml|lerna\.json|nx\.json|turbo\.json)$/.test(file));
  const publishedMember = workspaceRoot ? await findPublishedMember(ctx) : null;
  const pkg = publishedMember?.manifest ?? rootPkg;

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
    || all.some((f) => /(^|\/)(pyproject\.toml|setup\.py|go\.mod|Cargo\.toml|composer\.json|\w+\.gemspec)$/i.test(f))
    || all.some((f) => /\.(csproj|fsproj|vbproj|pom\.xml)$/i.test(f))
    || all.some((f) => /(^|\/)pom\.xml$/.test(f));

  /**
   * A name and a version. Without them nothing can depend on this, whatever else it
   * does right.
   */
  const named = typeof pkg.name === 'string' && typeof pkg.version === 'string';
  const described = typeof pkg.description === 'string' && (pkg.description as string).length > 0;
  const sourced = pkg.repository !== undefined || pkg.homepage !== undefined;

  /**
   * The other ecosystems' way of saying "something else may depend on this".
   *
   * Both facts were read from `package.json` and Python packaging alone, so no
   * library written in anything else could reach the `library` profile. Moq — a
   * mocking library of 243 C# files, `<PackageId>Moq</PackageId>` and
   * `<IsPackable>True</IsPackable>` in its csproj — was judged a client application
   * and asked at `high` for state durability, asset delivery and browser crash
   * reporting. tokio could not be classified at all.
   *
   * Each is the declaration its own toolchain requires to publish: a csproj that
   * names a package id, a Cargo manifest with a `[package]` name and version beside a
   * `src/lib.rs`. A crate that says `publish = false` is saying the opposite, and is
   * not counted.
   */
  let dotnetPackageId = false;
  for (const file of all.filter((f) => /\.(csproj|fsproj|vbproj)$/i.test(f)).slice(0, 12)) {
    const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (/<PackageId>|<IsPackable>\s*true\s*<\/IsPackable>|<GeneratePackageOnBuild>\s*true/i.test(raw)) {
      dotnetPackageId = true;
    }
  }

  let rustCrate = false;
  for (const file of all.filter((f) => /(^|\/)Cargo\.toml$/.test(f)).slice(0, 8)) {
    const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (!/^\s*\[package\]/m.test(raw)) continue;
    if (/^\s*publish\s*=\s*false/m.test(raw)) continue;
    if (!/^\s*name\s*=/m.test(raw) || !/^\s*version\s*=/m.test(raw)) continue;

    const crateRoot = file.replace(/Cargo\.toml$/, '');
    if (all.some((f) => f === `${crateRoot}src/lib.rs`)) rustCrate = true;
  }

  /**
   * Go says it with the absence of a `main` package.
   *
   * A module is importable by anything that knows its path; what makes it a program
   * instead is a `package main`. testify is a module of 37 files with no `main`
   * anywhere, and it came out `client-app` — below the floor, so in practice no
   * profile at all.
   *
   * A repository that ships both a library and a `cmd/` binary answers no here, which
   * is the cautious direction: a tool that also exposes packages is judged as a tool.
   */
  let goLibrary = false;
  if (all.some((f) => /(^|\/)go\.mod$/.test(f))) {
    const goFiles = ctx.files.source.filter((f) => /\.go$/.test(f));
    let sawMain = false;

    for (const file of goFiles.slice(0, 80)) {
      const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
      // At column 0 only: gofmt puts the package clause there, and an indented one is an
      // example inside a comment — gin's doc.go shows `\tpackage main` to explain usage,
      // and read as a program.
      if (/^package\s+main\s*$/m.test(raw)) { sawMain = true; break; }
    }

    goLibrary = goFiles.length > 0 && !sawMain;
  }

  /**
   * The JVM says it by configuring a publication.
   *
   * Every pom carries a groupId, an artifactId and a version, so those say nothing:
   * an application has them too. What separates a published artifact is the plugin
   * that uploads it — gson configures `central-publishing-maven-plugin`, Gradle
   * projects apply `maven-publish`, older poms name a `distributionManagement`.
   */
  let jvmPublication = false;
  for (const file of all.filter((f) => /(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/.test(f)).slice(0, 8)) {
    const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (/maven-publish|<distributionManagement>|central-publishing-maven-plugin|maven-deploy-plugin|nexus-staging/.test(raw)) {
      jvmPublication = true;
    }
  }

  const tauriConfigs = all.filter((file) => /(^|\/)tauri\.conf\.json$/.test(file));

  /**
   * A browser extension, which ships inside a packaged archive like any other bundle.
   *
   * `manifest_version` is the key the WebExtensions platform requires, and it appears
   * in nothing else. The file it sits in is not always `manifest.json`: Dark Reader
   * keeps one per browser — `manifest-chrome-mv3.json`, `manifest-firefox.json` —
   * and Violentmonkey writes `manifest.yml` and compiles it at build time. The key is
   * the contract; the file name is the project's business.
   *
   * Violentmonkey was asked at `high` how it delivers assets over HTTP. Its assets are
   * inside the `.xpi` the browser installed, which is the Electron case again.
   */
  const extensionManifests: string[] = [];
  for (const file of all.filter((f) => /(^|\/)manifest[\w.-]*\.(json|yml|yaml)$/i.test(f)).slice(0, 8)) {
    const raw = (await readTextFileSafe(ctx.root, file)) ?? '';
    if (/["']?manifest_version["']?\s*[:=]/.test(raw)) extensionManifests.push(file);
  }
  const desktopBundle: DetectorEvidence[] = [
    ...hasAnyDep(ctx, ['electron', 'electron-builder', '@tauri-apps/api', '@tauri-apps/cli'])
      .map((dep) => ({ type: 'dependency' as const, value: dep })),
    ...tauriConfigs.slice(0, 2).map((file) => ({ type: 'file' as const, value: file, file })),
    ...extensionManifests.slice(0, 2).map((file) => ({
      type: 'file' as const,
      value: `${file} declares manifest_version`,
      file,
    })),
  ];

  const entrypointCount = nodeEntrypoints.length
    + (pythonEntrypoints ? 1 : 0)
    + (dotnetPackageId ? 1 : 0)
    + (rustCrate ? 1 : 0)
    + (goLibrary ? 1 : 0)
    + (jvmPublication ? 1 : 0);

  return [
    {
      key: 'packaging.manifest',
      present: hasManifest,
      complete: hasManifest && (named || pythonEntrypoints || dotnetPackageId || rustCrate || goLibrary || jvmPublication),
      evidence: hasManifest
        ? [
            publishedMember
              ? { type: 'file' as const, value: `${publishedMember.path} names and versions the published package`, file: publishedMember.path }
              : { type: 'note' as const, value: named ? 'a manifest with a name and a version' : 'a package manifest' },
          ]
        : [],
      details: { named, described, sourced, private: isPrivate },
    },
    {
      key: 'packaging.entrypoints',
      present: entrypointCount > 0,
      // A crate, a Go package, a Maven publication and a NuGet package are typed by the
      // language they are written in; `types` is the question only JavaScript has to ask.
      complete: entrypointCount > 0 && (hasTypes || pythonEntrypoints || goLibrary || rustCrate || jvmPublication || dotnetPackageId),
      evidence: [
        ...nodeEntrypoints.map((key) => ({ type: 'note' as const, value: `package.json declares "${key}"` })),
        ...(pythonEntrypoints ? [{ type: 'note' as const, value: 'a Python package or console script declaration' }] : []),
        ...(dotnetPackageId ? [{ type: 'note' as const, value: 'a project that declares a NuGet package id' }] : []),
        ...(rustCrate ? [{ type: 'note' as const, value: 'a Cargo package with a library crate root' }] : []),
        ...(goLibrary ? [{ type: 'note' as const, value: 'a Go module with no main package' }] : []),
        ...(jvmPublication ? [{ type: 'note' as const, value: 'a build that configures a Maven publication' }] : []),
        ...(hasTypes ? [{ type: 'note' as const, value: 'TypeScript types are declared' }] : []),
      ],
      details: { nodeEntrypoints, hasTypes, pythonEntrypoints, dotnetPackageId, rustCrate, goLibrary, jvmPublication },
    },
    {
      key: 'packaging.license',
      // A licence file and a declared licence say the same thing; either alone is an
      // answer, and a reader who has one does not need the other to use the code.
      present: licenseFiles.length > 0 || declaredLicense,
      complete: licenseFiles.length > 0 && declaredLicense,
      evidence: evidenceOrSearch(licenseEvidence, 'a licence', ['LICENSE', 'LICENCE', 'COPYING', 'a license field in package.json', 'a license classifier in pyproject.toml']),
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
      /**
       * An application that ships as a desktop bundle, not as a page.
       *
       * `electron` in the manifest and a `tauri.conf.json` in the tree are the two
       * ways a project says its product is installed rather than visited. Both are
       * the toolchain's own names: electron-builder reads the first, the Tauri CLI
       * reads the second.
       *
       * Recorded here so the profile can stop asking a desktop application how it
       * caches assets over HTTP — the question a Unity game stopped being asked in
       * 0.84.0, for the same reason. marktext, an Electron editor, was told at `high`
       * that it has no asset-delivery policy.
       */
      key: 'packaging.desktopBundle',
      present: desktopBundle.length > 0,
      evidence: desktopBundle,
    },
    {
      key: 'docs.readme',
      present: readmeFiles.length > 0,
      complete: readmeLength > 400,
      evidence: evidenceOrSearch(
        readmeFiles.map((file) => ({ type: 'file' as const, value: `${file} (${readmeLength} characters)`, file })),
        'a readme',
        ['README', 'README.md', 'README.rst', 'readme.txt'],
      ),
      details: { length: readmeLength },
    },
    {
      key: 'quality.tests',
      present: testFiles.length > 0,
      complete: testFiles.length > 0 && (hasTestScript || hasPyTestRunner || hasToolchainTestRunner),
      evidence: evidenceOrSearch(
        [
          ...testFiles.slice(0, 3).map((file) => ({ type: 'file' as const, value: file, file })),
          ...(hasTestScript ? [{ type: 'note' as const, value: 'an "npm test" script' }] : []),
          ...(hasPyTestRunner ? [{ type: 'note' as const, value: 'a Python test runner' }] : []),
          ...(hasToolchainTestRunner && !hasTestScript && !hasPyTestRunner ? [{ type: 'note' as const, value: "the toolchain's own test command" }] : []),
        ],
        'tests',
        ['a path under test/ or tests/', '*.test.*', '*.spec.*', 'test_*.py', '*_test.go', 'an "npm test" script', 'pytest', 'tox'],
      ),
      details: { files: testFiles.length, runner: hasTestScript || hasPyTestRunner || hasToolchainTestRunner },
    },
    {
      key: 'quality.ci',
      present: ciFiles.length > 0,
      complete: ciFiles.length > 0 && testFiles.length > 0,
      evidence: evidenceOrSearch(
        ciFiles.map((file) => ({ type: 'file' as const, value: file, file })),
        'anything that runs the tests without being asked',
        ['.github/workflows/', '.gitlab-ci.yml', '.circleci/config.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.travis.yml'],
      ),
      details: { files: ciFiles.length },
    },
  ];
}

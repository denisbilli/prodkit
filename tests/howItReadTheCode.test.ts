import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { renderMarkdown } from '../src/report/markdownReport';
import { describeReadingDepth, readingDepths } from '../src/analyzer/readingDepth';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Sixty-eight keyword searches against one structural claim, and six of eighteen
 * readable extensions covered by a parser. A report on a Go project and a report on a
 * TypeScript project looked equally sure of themselves, and were not.
 *
 * This is the same failure as everything else corrected on 18 September — saying more
 * than can be shown — applied to the analyzer's own method rather than to a finding.
 */
describe('the report says how it read the code', () => {
  it('calls a language parsed only where a parser reads it', async () => {
    const analysis = await analyzeProject(fixture('roles-and-chat'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable, analysis.parsedStructure);

    expect(readings.find((entry) => entry.language === 'JavaScript')?.depth).toBe('parsed');
  });

  it('calls a language searched where only keywords reach it', async () => {
    const analysis = await analyzeProject(fixture('django-basic'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable, analysis.parsedStructure);

    expect(readings.find((entry) => entry.language === 'Python')?.depth).toBe('searched');
  });

  it('counts a language it cannot read at all as skipped', async () => {
    const analysis = await analyzeProject(fixture('phoenix-app'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable, analysis.parsedStructure);

    expect(readings.find((entry) => entry.language === 'Elixir')?.depth).toBe('skipped');
  });

  it('says nothing when everything was parsed', () => {
    // A report congratulating itself on reading properly is noise.
    expect(describeReadingDepth([{ language: 'TypeScript', files: 40, depth: 'parsed' }], true)).toBeUndefined();
  });

  /**
   * The case the list was silent in, and the only one a reader can act on.
   *
   * `depthFor` read the extension and nothing else, so on a machine without the
   * optional compiler a JavaScript repository still printed `parsed` — and since the
   * sentence only speaks when something was shallower than the rest, the report said
   * nothing at all. Measured: seven of the hundred and thirty-three fixtures answer
   * differently with the compiler hidden, and `segreto-in-italiano` reports a hardcoded
   * signing secret as `passed`.
   */
  it('calls JavaScript searched when the optional compiler is not installed', async () => {
    const analysis = await analyzeProject(fixture('roles-and-chat'));
    const readings = readingDepths(analysis.files.source, analysis.files.unreadable, false);

    expect(readings.find((entry) => entry.language === 'JavaScript')?.depth).toBe('searched');
  });

  it('tells a reader without the compiler that structure went unread, and how to fix it', () => {
    const sentence = describeReadingDepth([{ language: 'TypeScript', files: 40, depth: 'searched' }], false);

    expect(sentence).toMatch(/typescript` peer dependency is not installed/);
    expect(sentence).toMatch(/Install it alongside this package/);
  });

  it('does not blame the compiler for a language no parser here will ever read', () => {
    const sentence = describeReadingDepth([{ language: 'Go', files: 40, depth: 'searched' }], false);

    expect(sentence).toMatch(/Go was read as text/);
    expect(sentence).not.toMatch(/peer dependency/);
  });

  it('tells the reader, rather than only the diagnostics', async () => {
    const report = buildReport(await analyzeProject(fixture('django-basic')), { profile: 'auto' });
    const markdown = renderMarkdown(report);

    expect(markdown).toMatch(/How this repository was read/);
    expect(markdown).toMatch(/Python/);
    expect(markdown).toMatch(/rest on weaker evidence/);
  });
});

/**
 * `AndroidManifest.xml` says Android. `build.gradle` says the JVM.
 *
 * spring-petclinic — the canonical Spring web application — was read as a mobile app at
 * high confidence, on the strength of having a Gradle build. So would every JVM server
 * ever written.
 */
describe('what makes a repository a phone application', () => {
  it('does not call a Spring service a mobile app', async () => {
    const analysis = await analyzeProject(fixture('spring-service'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(false);
  });

  it('still recognises an Android build', async () => {
    // The line that makes a Gradle build an Android build is the plugin, and it has to
    // be read rather than matched on a path.
    const analysis = await analyzeProject(fixture('android-gradle-app'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect((analysis.detectors['mobile.platform']?.details?.platforms as string[])).toContain('android');
  });

  it('still recognises a manifest without any Gradle at all', async () => {
    const analysis = await analyzeProject(fixture('android-app'));

    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
  });
});

/**
 * A true signal about one project, read as a fact about the whole.
 *
 * dotnet/eShop contains a real MAUI client — the markers are not a false positive — and
 * it is one project of a dozen: 137 source files of 515, beside a web application and
 * eight services. The repository came back as a phone application.
 */
describe('one project inside a repository is not the repository', () => {
  it('does not call a system with a mobile client a mobile app', async () => {
    const analysis = await analyzeProject(fixture('dotnet-system'));
    const report = buildReport(analysis, { profile: 'auto' });

    // The markers are real and stay found; what changes is what they are taken to mean.
    expect(analysis.detectors['mobile.platform']?.present).toBe(true);
    expect(report.productProfile?.inferredProfile).not.toBe('mobile-app');
  });

  it('measures how much of the repository the mobile project is', async () => {
    const analysis = await analyzeProject(fixture('dotnet-system'));

    expect(analysis.detectors['mobile.platform']?.details?.sourceShare as number).toBeLessThan(0.5);
  });

  it('still calls a phone application a phone application', async () => {
    // Every repository in the corpus that is one has its manifest at the root and scores
    // 1, including the Xcode layout where the project bundle sits beside the sources.
    for (const name of ['android-app', 'flutter-app', 'android-gradle-app', 'swift-app']) {
      const analysis = await analyzeProject(fixture(name));

      expect(analysis.detectors['mobile.platform']?.details?.sourceShare as number, name).toBe(1);
    }
  });
});

/**
 * Five public libraries out of five were not identified as libraries, and the mechanism
 * was the same in all of them: the documentation site inside the repository.
 *
 * zod came back a client application, vite came back a client application, and ruff — a
 * linter written in Rust with every packaging signal present — came back a static site,
 * read from its React playground. The site that documents a product is not the product.
 */
describe('a package with a documentation site is still a package', () => {
  it('recognises the docs site rather than mistaking it for the product', async () => {
    const analysis = await analyzeProject(fixture('library-with-docs'));

    expect(analysis.detectors['docs.site']?.present).toBe(true);
    expect(buildReport(analysis, { profile: 'auto' }).productProfile?.inferredProfile).toBe('library');
  });

  it('does not read a test server as the product serving requests', async () => {
    /**
     * axios declares `express` in devDependencies to run a test server against itself,
     * and was read as having a backend. A server framework the product does not ship
     * with is a fixture. Not one repository in the local corpus declares a backend only
     * in devDependencies, so this costs nothing there.
     */
    const analysis = await analyzeProject(fixture('library-with-docs'));

    expect(analysis.stack.backend).toEqual([]);
  });

  it('still finds a server the product actually ships', async () => {
    const analysis = await analyzeProject(fixture('express-basic'));

    expect(analysis.stack.backend).toContain('express');
  });

  it('still keeps an application out of the library profile', async () => {
    // The gate that matters is the backend, and it still closes.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'auto' });

    expect(report.productProfile?.inferredProfile).not.toBe('library');
  });
});

/**
 * In a monorepo the root manifest is not the package.
 *
 * zod's root is `private: true` with `workspaces: ["packages/*"]`, no name, no version
 * and no entry point; `zod` itself is `packages/zod/package.json`. vite does not even
 * have a `workspaces` field — pnpm keeps that in its own file. Both came back as
 * repositories that publish nothing.
 */
describe('a package inside a workspace', () => {
  it('reads the published member rather than the workspace root', async () => {
    const analysis = await analyzeProject(fixture('monorepo-library'));

    expect(analysis.detectors['packaging.manifest']?.complete).toBe(true);
    expect(analysis.detectors['packaging.entrypoints']?.present).toBe(true);
  });

  it('points the evidence at the manifest the claim rests on', async () => {
    // A root that says nothing is not a citation somebody can check.
    const analysis = await analyzeProject(fixture('monorepo-library'));
    const cited = (analysis.detectors['packaging.manifest']?.evidence ?? []).map((item) => String(item.value));

    expect(cited.join(' ')).toMatch(/packages\/core\/package\.json/);
  });

  it('does not count a docs site or a playground as the product\'s server', async () => {
    /**
     * zod's only workspace with a backend is `packages/docs`. vite's are ten directories
     * under `playground/`, every one an Express server and none of them vite.
     */
    const report = buildReport(await analyzeProject(fixture('monorepo-library')), { profile: 'auto' });

    // The servers are still detected — they are really there — and they are not the
    // product's.
    expect(report.detectedStack.backend.length).toBeGreaterThan(0);
    expect(report.productProfile?.inferredProfile).toBe('library');
  });

  it('still counts a server that is the product', async () => {
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'auto' });

    expect(report.productProfile?.inferredProfile).not.toBe('library');
  });
});

/**
 * A library that integrates with web frameworks declares them as extras.
 *
 * langchain came back a hosted AI product with fifteen high findings — GDPR consent,
 * billing, tenant isolation — because `fastapi` and `aiohttp` appear in its optional
 * dependencies. llama_index declares four frameworks that way. Nobody installing either
 * gets a web server.
 */
describe('what a Python package ships, and what it merely offers', () => {
  it('does not read an optional extra as the product\'s server', async () => {
    const analysis = await analyzeProject(fixture('python-library-extras'));

    expect(analysis.stack.backend).toEqual([]);
    expect(buildReport(analysis, { profile: 'auto' }).productProfile?.inferredProfile).toBe('library');
  });

  it('still reads a server the package installs by default', async () => {
    const analysis = await analyzeProject(fixture('django-basic'));

    expect(analysis.stack.backend).toContain('django');
  });

  it('counts an import as use, not as an offer', async () => {
    /**
     * A repository with no manifest at all — one file that imports Streamlit — declares
     * nothing optional. Treating its imports as extras made a Streamlit application
     * unreadable, which the corpus caught within a minute of the change.
     */
    const analysis = await analyzeProject(fixture('streamlit-app'));

    expect(analysis.stack.backend).toContain('streamlit');
  });

  it('needs aiohttp to be serving, not merely present', async () => {
    // aiohttp is a client as often as a server, and thousands of packages depend on it
    // to make requests. `aiohttp.web` is what says it is being served.
    const analysis = await analyzeProject(fixture('python-library-extras'));

    expect(analysis.stack.backend).not.toContain('aiohttp');
  });
});

/**
 * "Team" is the third word products use for a tenant, and the only one that also means
 * a team.
 *
 * Documenso has `teamId` in 388 files, `TeamMember` in 79 and `organizationId` in none,
 * and no tenancy was detected at all — so a document-signing product with teams and
 * seats read as a consumer application.
 */
describe('a team that has members is an account', () => {
  it('reads a team with a membership table as a tenant', async () => {
    const analysis = await analyzeProject(fixture('team-tenant'));

    expect(analysis.detectors['tenancy.organization']?.present).toBe(true);
    expect(analysis.detectors['tenancy.membership']?.present).toBe(true);
  });

  it('does not read a league of football teams as multi-tenant', async () => {
    // `homeTeamId` and `awayTeamId` with nobody belonging to them: a domain entity, not
    // an account boundary. The pairing is what tells the two apart.
    const analysis = await analyzeProject(fixture('sports-teams'));

    expect(analysis.detectors['tenancy.organization']?.present).toBe(false);
  });
});

/**
 * `fixtures` was in the list of directories to skip and `fixture` was not.
 */
describe('a directory named for one test fixture', () => {
  it('is skipped like the plural it was listed as', async () => {
    /**
     * `extra/fixture/authsources.php` made PHP one of the languages of an Elixir
     * analytics product, and of cal.com, which is TypeScript.
     */
    const analysis = await analyzeProject(fixture('singular-fixture'));

    expect(analysis.files.source.some((file) => file.includes('fixture/'))).toBe(false);
    expect(analysis.stack.languages).not.toContain('php');
  });
});

/**
 * A model SDK in the dependencies shows that a product calls a model. It does not show
 * that AI is what the product is.
 *
 * Supabase, Mattermost and PostHog all came back "AI SaaS" — a backend platform, a chat
 * server and an analytics product, each with one assistant feature inside it. Counting
 * settles nothing: dify, a genuine AI platform, touches a model in 1.2% of its files and
 * supabase in 1.2% too, while PostHog's 1.9% is higher than both.
 */
describe('what the AI profile claims', () => {
  it('names itself after the evidence rather than after the product', async () => {
    const { getProductProfile } = await import('../src/expectations/productProfiles');

    expect(getProductProfile('ai-saas').title).toBe('SaaS that calls a model');
  });

  it('asks for exactly the duties that come with calling one', async () => {
    /**
     * The expectations were never the problem: this profile is B2B SaaS plus background
     * jobs, cost control and prompt safety, and a product with one assistant feature
     * owes all three for that feature. Nothing is taken away, which is what makes
     * applying it to a platform defensible.
     */
    const { getProductProfile } = await import('../src/expectations/productProfiles');

    const applicable = (id: 'ai-saas' | 'b2b-saas') =>
      getProductProfile(id).capabilities.filter((capability) => capability.importance !== 'not_applicable').map((capability) => capability.id);

    const extra = applicable('ai-saas').filter((id) => !applicable('b2b-saas').includes(id));
    const missing = applicable('b2b-saas').filter((id) => !applicable('ai-saas').includes(id));

    expect(extra.sort()).toEqual(['ai.cost-control', 'ai.prompt-safety', 'jobs.background']);
    expect(missing).toEqual([]);
  });
});

/**
 * Three real products each raised a critical — the severity that bars a report from the
 * top band — and every piece of evidence behind all three came from a test.
 *
 * cal.com from `playwright/` and `*.e2e.ts`, chatwoot from `spec/`, which is where every
 * Ruby project puts its tests, medusa from `integration-tests/`. A syntax tree would
 * have parsed the same files and reached the same conclusion, which is why what gets
 * read comes before how it is read.
 */
describe('a secret in a test is not a secret in production', () => {
  it('skips the conventions other ecosystems use for tests', async () => {
    const analysis = await analyzeProject(fixture('secrets-in-tests'));

    expect(analysis.files.source).toEqual(['src/auth.js']);
  });

  it('raises nothing against a project whose only fake secrets are in tests', async () => {
    const report = buildReport(await analyzeProject(fixture('secrets-in-tests')), { profile: 'auto' });

    expect(report.criticalIssues).toEqual([]);
  });

  it('does not read a header name as a secret', async () => {
    /**
     * `export const X_CAL_SECRET_KEY = "x-cal-secret-key"` is the name of an HTTP
     * header, spelled in kebab-case beside the constant that holds it. Compared with
     * punctuation and case stripped, because the whole trick is that the two differ
     * only in spelling.
     */
    const analysis = await analyzeProject(fixture('secrets-in-tests'));
    const weak = [
      ...(analysis.detectors['env.secretFallback.jwt']?.evidence ?? []),
      ...(analysis.detectors['env.secretFallback.apiKey']?.evidence ?? []),
      ...(analysis.detectors['env.secretFallback.unknown']?.evidence ?? []),
    ];

    expect(weak.some((item) => String(item.value).includes('X_APP_SECRET_KEY'))).toBe(false);
  });

  it('still raises a real fallback secret', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });

    expect(report.criticalIssues.map((finding) => finding.id)).toContain('security.weak-secret');
  });
});

/**
 * A table is visible only in the shape, which is where a syntax tree earns its keep.
 *
 * Ghost keeps a map of every setting to the group it belongs to —
 * `admin_session_secret: 'core'` beside fifty-nine others — and was told it had a
 * hardcoded secret. Read as text that line is a secret-named key assigned a short
 * string, which is exactly the shape of a fallback. Read as a tree it says which group
 * a setting is in.
 */
describe('an entry in a lookup table is not an assignment', () => {
  it('does not read a settings map as hardcoded secrets', async () => {
    const report = buildReport(await analyzeProject(fixture('settings-map')), { profile: 'auto' });
    const weak = report.findings.find((finding) => finding.id === 'security.weak-secret');

    expect(weak?.evidence.some((item) => item.file?.includes('setting-groups'))).toBe(false);
  });

  it('still raises the fallback in the configuration beside it', async () => {
    // The same repository, the same severity, one file along: a mixed object with a
    // real `|| 'dev-secret'` in it. Excusing tables must not excuse configuration.
    const report = buildReport(await analyzeProject(fixture('settings-map')), { profile: 'auto' });
    const weak = report.findings.find((finding) => finding.id === 'security.weak-secret');

    expect(weak?.status).toBe('missing');
    expect(weak?.evidence.some((item) => item.file?.includes('config'))).toBe(true);
    /**
     * And a small object whose properties are all plain strings is configuration too.
     * Two of them is how a fallback is written; sixty is how a table is.
     */
    expect(weak?.evidence.some((item) => item.file?.includes('legacy-config'))).toBe(true);
  });
});

/**
 * A match in the documentation is a match about the documentation.
 *
 * Medusa was told its CORS policy was open, evidenced entirely from `www/apps/cloud/` —
 * the site that documents Medusa. Vite keeps ten Express servers under `playground/`
 * for a related reason. These are not false matches: the lines are there, and they are
 * about something other than the product.
 */
describe('a finding evidenced only in the documentation', () => {
  it('does not claim the product does it', async () => {
    const report = buildReport(await analyzeProject(fixture('product-with-docs')), { profile: 'auto' });
    const cors = report.findings.find((finding) => finding.id === 'security.cors-origin');

    expect(cors?.status).toBe('unknown');
    expect(cors?.description).toMatch(/documentation site or a playground/);
  });

  it('keeps a finding with one line in the product', async () => {
    /**
     * The rule is "every citation", not "any". Medusa's webhook finding cites sixty-eight
     * files, twenty of them in `packages/core`, and it stands — I had read only the
     * first three, which were all documentation, and concluded wrongly.
     */
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'auto' });
    const uploads = report.findings.find((finding) => finding.id === 'uploads.public-exposure');

    expect(uploads?.status).not.toBe('unknown');
  });

  it('keeps every finding when the documentation is the product', async () => {
    // A repository whose source is all under `docs/` is a documentation site, and its
    // findings are its own.
    const analysis = await analyzeProject(fixture('product-with-docs'));

    expect(analysis.files.source.some((file) => !file.startsWith('www/'))).toBe(true);
  });
});

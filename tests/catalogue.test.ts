import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { supportedStacks, labelFor, hasLabel } from '../src/analyzer/catalogue';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('supported stack catalogue', () => {
  const catalogue = supportedStacks();

  it('has a name written for everything it lists', () => {
    // A framework added to a detector table with no label is the drift this catches:
    // it would otherwise reach a marketing page as "mikro-orm". Checked through
    // hasLabel rather than by the look of the string, because aiohttp, chi and htmx
    // are lowercase on purpose.
    for (const [category, entries] of Object.entries(catalogue)) {
      if (category === 'languages') continue;

      for (const entry of entries) {
        expect(hasLabel(entry.id), `${entry.id} has no label`).toBe(true);
        expect(entry.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('lists each framework once, however many packages reach it', () => {
    for (const [category, entries] of Object.entries(catalogue)) {
      const ids = entries.map((entry) => entry.id);
      expect(new Set(ids).size, `${category} repeats an id`).toBe(ids.length);
    }
  });

  it('names what a framework is detected from when a dependency is not enough', () => {
    const astro = catalogue.backend.find((entry) => entry.id === 'astro');

    // Astro is the case that makes this field worth having: it is a backend only when
    // configured to serve requests, and a catalogue that said "Astro" flatly would be
    // promising something the analyzer deliberately does not do.
    expect(astro?.detectedFrom).toMatch(/serve requests/);
  });

  /**
   * The point of the catalogue is that it cannot drift from the detectors. This proves
   * one direction of that for a real repository: what the analyzer named, the
   * catalogue lists.
   */
  it('lists everything the analyzer names for a project it recognises', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-catalogue-'));

    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'sample',
        dependencies: { next: '^15.0.0', react: '^19.0.0', '@prisma/client': '^6.0.0', pg: '^8.0.0' },
      }),
    );
    await fs.writeFile(path.join(root, 'index.ts'), 'export const x = 1;\n');

    const analysis = await analyzeProject(root);

    const listed = new Set([
      ...catalogue.backend.map((entry) => entry.id),
      ...catalogue.frontend.map((entry) => entry.id),
      ...catalogue.mobile.map((entry) => entry.id),
      ...catalogue.databases.map((entry) => entry.id),
      ...catalogue.orms.map((entry) => entry.id),
    ]);

    for (const named of [...analysis.stack.backend, ...analysis.stack.frontend, ...analysis.stack.databases, ...analysis.stack.orms]) {
      expect(listed.has(named), `${named} is detected but not in the catalogue`).toBe(true);
    }

    await fs.rm(root, { recursive: true, force: true });
  });

  it('falls back to the id for something it has no name for', () => {
    expect(labelFor('next')).toBe('Next.js');
    expect(labelFor('not-a-framework')).toBe('not-a-framework');
  });
});

describe('README stacks section', () => {
  it('is what the catalogue renders today', async () => {
    // The list of supported stacks used to be typed into the README by hand, and had
    // drifted from the detectors. It is generated now, and this is the check that it
    // was regenerated: `npm run docs:stacks` after changing a detector.
    const { renderSupportedStacksMarkdown } = await import('../src/analyzer/catalogueMarkdown');
    const readme = await fs.readFile(path.resolve(__dirname, '..', 'README.md'), 'utf8');

    const start = readme.indexOf('<!-- stacks:start -->');
    const end = readme.indexOf('<!-- stacks:end -->');

    expect(start, 'README has no stacks markers').toBeGreaterThan(-1);
    expect(readme.slice(start, end + '<!-- stacks:end -->'.length)).toBe(renderSupportedStacksMarkdown());
  });
});

describe('profile choices', () => {
  it('offers every profile the type allows, and nothing else', async () => {
    const { productProfileChoices } = await import('../src/expectations/productProfiles');
    const ids = productProfileChoices().map((choice) => choice.id);

    // The list a consumer renders has to be the list the analyzer accepts. The cloud
    // application kept its own and fell three profiles behind, so game, client-app and
    // mobile-app existed and could not be chosen.
    const declared: string[] = [
      'static-site',
      'internal-tool',
      'b2c-app',
      'b2b-saas',
      'ai-saas',
      'game',
      'client-app',
      'library',
      'mobile-app',
      'marketplace',
      'auto',
      'observed-only',
    ];

    expect([...ids].sort()).toEqual([...declared].sort());
  });

  it('separates a profile from an instruction about how to judge', async () => {
    const { productProfileChoices } = await import('../src/expectations/productProfiles');
    const choices = productProfileChoices();

    // auto and observed-only are choices, not profiles: one asks the analyzer to
    // decide, the other asks it not to. A caller rendering a dropdown needs both; a
    // caller asking "what are the profiles?" needs neither.
    expect(choices.find((c) => c.id === 'auto')?.judged).toBe(false);
    expect(choices.find((c) => c.id === 'observed-only')?.judged).toBe(false);
    expect(choices.find((c) => c.id === 'mobile-app')?.judged).toBe(true);
  });
});

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Seventeen of the seventy-seven repositories in the verification corpus were reported
 * "inconclusive — no package manifest was found in any format this analyzer reads", and
 * had their score capped at 39 on that basis. None of them was unreadable. They were
 * browser games in one `index.html`, Python scripts that name their dependencies in the
 * first three lines, and a Unity project whose engine had already been identified by
 * name in the same report.
 */
describe('projects with no package manifest', () => {
  describe('a Unity game', () => {
    it('is a game, not a b2b SaaS', async () => {
      const analysis = await analyzeProject(fixture('unity-game'));

      expect(inferProductProfile(analysis).inferredProfile).toBe('game');
    });

    it('does not count the engine packages Unity downloads as its own code', async () => {
      // `Library/PackageCache/` holds the 65 packages Unity installs. Scanning them
      // made a two-file game a 6054-file application with accounts, an administrative
      // surface and subscriptions.
      const analysis = await analyzeProject(fixture('unity-game'));

      expect(analysis.files.source.some((f) => f.startsWith('Library/'))).toBe(false);
      expect(analysis.files.source).toContain('Assets/Player.cs');
    });

    it('does not read a hash constant as a payment processor', async () => {
      // `STRIPE_LEN` in Unity's bundled xxHash3, where a stripe is a block of bytes.
      const analysis = await analyzeProject(fixture('unity-game'));

      expect(analysis.detectors['billing.stripe']?.present).toBe(false);
    });

    it('does not read a debug-symbols bundle as an iOS project', async () => {
      // Every macOS `.bundle`, `.framework` and `.dSYM` carries an `Info.plist` by
      // definition, and a build cache is full of them.
      const analysis = await analyzeProject(fixture('unity-game'));

      expect(analysis.detectors['mobile.platform']?.details?.platforms ?? []).toEqual([]);
    });

    it('is not called unreadable when its engine has been named', async () => {
      const report = buildReport(await analyzeProject(fixture('unity-game')), { profile: 'auto' });

      expect(report.inconclusive).toBe(false);
    });
  });

  describe('a browser game that loads its engine from a CDN', () => {
    it('reads the script tag as the dependency declaration it is', async () => {
      const analysis = await analyzeProject(fixture('browser-game-cdn'));

      expect(analysis.detectors['game.engine']?.present).toBe(true);
    });

    it('says the dependency was read from the code, not from a manifest', async () => {
      // A dependency nobody declared is a weaker fact than one pinned in a lockfile,
      // and the reader is entitled to know which of the two the reading rests on.
      const analysis = await analyzeProject(fixture('browser-game-cdn'));

      expect(analysis.stack.warnings.some((w) => /No dependency manifest was found/.test(w))).toBe(true);
    });
  });

  describe('a Python application with no requirements file', () => {
    it('reads what it imports', async () => {
      const analysis = await analyzeProject(fixture('streamlit-app'));

      expect(analysis.stack.backend).toContain('streamlit');
    });

    it('does not mistake the standard library or a neighbouring file for a package', async () => {
      // `import json` is not a dependency, and `from helpers import …` is one file in
      // this repository reaching for another.
      const analysis = await analyzeProject(fixture('streamlit-app'));

      expect(analysis.stack.backend).not.toContain('json');
      expect(analysis.stack.backend).not.toContain('helpers');
    });
  });

  describe('a page with no framework behind it', () => {
    it('is still a front end', async () => {
      // A repository whose product is `index.html` plus a script had no front end, no
      // stack, and a report that called it unreadable.
      const analysis = await analyzeProject(fixture('vanilla-static'));

      expect(analysis.stack.frontend).toContain('html');
      expect(buildReport(analysis, { profile: 'auto' }).inconclusive).toBe(false);
    });
  });

  it('does not add "html" to a project a framework already claimed', async () => {
    // Every web application ships HTML; saying "next, react, html" is noise. The
    // fallback is a last resort, not another entry in the list.
    const analysis = await analyzeProject(fixture('nextjs-app'));

    expect(analysis.stack.frontend).toContain('react');
    expect(analysis.stack.frontend).not.toContain('html');
  });
});

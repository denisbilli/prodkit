import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = (report: { findings: Array<{ id: string }> }, id: string) =>
  report.findings.find((f) => f.id === id);

/**
 * An application that is installed rather than visited has no browser cache to
 * configure.
 *
 * `Cache-Control`, `_headers` and `vercel.json` are how a browser is told how long to
 * keep a file, and the assets of a desktop application are inside the download.
 * marktext ships as an Electron bundle and was told at `high` that it has no
 * asset-delivery policy — the same question a Unity game stopped being asked in
 * 0.84.0, arrived at from the other direction: then from a `ProjectVersion.txt`, now
 * from `electron` in a manifest and a `tauri.conf.json` in the tree.
 */
describe('an application you install', () => {
  it('is not asked how it caches assets, when it is an Electron bundle', async () => {
    const report = buildReport(await analyzeProject(fixture('electron-editor')), { profile: 'client-app' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  it('is not asked, when it is a Tauri bundle', async () => {
    const report = buildReport(await analyzeProject(fixture('tauri-client')), { profile: 'client-app' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  /**
   * A browser extension ships inside a packaged archive like any other bundle.
   *
   * `manifest_version` is the key the WebExtensions platform requires and it appears
   * in nothing else. The file it sits in is the project's business: Dark Reader keeps
   * one per browser, Violentmonkey writes `manifest.yml` and compiles it at build
   * time. Violentmonkey was asked at `high` how it delivers assets over HTTP; its
   * assets are inside the `.xpi` the browser installed.
   */
  it('is not asked, when it is a browser extension', async () => {
    const report = buildReport(await analyzeProject(fixture('browser-extension-mv3')), { profile: 'client-app' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  it('is not asked, when the manifest is compiled from YAML', async () => {
    const report = buildReport(await analyzeProject(fixture('browser-extension-yaml')), { profile: 'client-app' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });

  /**
   * The direction this must not drift in: a browser application is still asked, and
   * one that answers still passes.
   */
  it('still asks an application that runs in a browser', async () => {
    const report = buildReport(await analyzeProject(fixture('phaser-game')), { profile: 'auto' });

    expect(finding(report, 'expectation.app.asset-delivery.required')?.status).toBe('missing');
  });

  it('still lets a browser application answer', async () => {
    const report = buildReport(await analyzeProject(fixture('browser-game-cached-assets')), { profile: 'auto' });

    expect(finding(report, 'expectation.app.asset-delivery.required')).toBeUndefined();
  });
});

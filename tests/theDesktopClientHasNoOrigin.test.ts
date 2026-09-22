import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A question with no subject is not a gap.
 *
 * `client-app` covers two things that are not alike: a single-page application talking
 * to a server somebody runs, and a program people install. It asked both for a rate
 * limit, a CORS policy, a health endpoint and a way to export and erase personal data.
 * For a desktop binary none of those has a subject — no origin to allow, no request to
 * limit, no user table to export — and `usebruno/bruno`, an API client with no accounts
 * of any kind, carried four of them as missing or partial: four instructions to build
 * something the product has nowhere to put.
 *
 * `stack.backend` cannot tell the two apart. Bruno depends on express and runs one
 * in-process to proxy the requests its user composes, so "no backend" is false of
 * exactly the repository this is about — which is why this fixture ships an express
 * listener too.
 *
 * Electron and Tauri can tell them apart, and neither is a word anybody chose.
 */
describe('the desktop client has no origin', () => {
  const statuses = async () => {
    const report = buildReport(await analyzeProject(fixture('desktop-client-has-no-origin')), { profile: 'auto' });
    return new Map((report.productProfile?.capabilities ?? []).map((c) => [c.capabilityId, c.status]));
  };

  it('does not ask a desktop binary for an origin, a rate limit or a user export', async () => {
    const status = await statuses();

    for (const id of ['security.cors', 'security.rate-limit', 'gdpr.export', 'gdpr.erasure', 'observability.health']) {
      expect([id, status.get(id)]).toEqual([id, 'not_applicable']);
    }
  });

  /**
   * And keeps asking for the half that does apply. A desktop application still has a
   * release pipeline, and signing and notarising it is the harder half of one.
   */
  /**
   * And Electron on its own does not carry it. The corpus caught that on the first run:
   * a monorepo with an `electron` workspace beside an express backend on postgres and
   * redis lost its rate limit and CORS requirements, and a product that keeps a shared
   * database has users to export and an origin to protect.
   */
  it('does not excuse a service that happens to ship a desktop client', async () => {
    const report = buildReport(
      await analyzeProject(fixture('monorepo-with-frontend-and-backend-subfolders')),
      { profile: 'auto' },
    );
    const status = new Map((report.productProfile?.capabilities ?? []).map((c) => [c.capabilityId, c.status]));

    expect(status.get('security.rate-limit')).not.toBe('not_applicable');
    expect(status.get('security.cors')).not.toBe('not_applicable');
  });

  it('still asks how it ships', async () => {
    const status = await statuses();

    expect(status.get('deployment.readiness')).not.toBe('not_applicable');
  });
});

/**
 * The same fact, deciding which profile a desktop application gets at all.
 *
 * Installed-rather-than-served is a third reading of what `client-app` identifies,
 * folded into the signal that already carries two — a separate identifying signal for
 * it moved nine fixtures from high confidence to medium without changing one verdict,
 * which is the trap the comment beside that signal already describes.
 */
describe('installed rather than served', () => {
  const inferred = async (name: string) => {
    const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
    return report.productProfile?.inferredProfile;
  };

  /**
   * `electron-editor` has a front end, no backend, no database and no sign-in — every
   * condition `static-site` asks for — and came out a brochure site. Nothing that ships
   * through `electron-builder` is a static site, however little of it there is.
   */
  it('is not a static site', async () => {
    expect(await inferred('electron-editor')).toBe('client-app');
  });

  /**
   * And it protects a desktop client from being read as a consumer application when its
   * dependency list mentions authentication. `usebruno/bruno` declares `jsonwebtoken`,
   * `jose` and `cookie-parser` and uses them in a shim that hands JWT to the scripts its
   * *user* writes inside a request; it authenticates nobody. Raising `accounts to
   * manage` to -3 — which is what stops a Go notification server with users and a
   * database being called a client application — took bruno with it until this fact
   * held it back.
   */
  it('keeps a desktop client out of the consumer profile', async () => {
    expect(await inferred('desktop-client-that-hands-out-jwt')).toBe('client-app');
  });
});

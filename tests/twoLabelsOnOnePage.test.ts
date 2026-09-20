import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const FIXTURES = path.resolve(__dirname, 'fixtures');

/**
 * "Production ready", directly above "This project is not ready to launch as B2C App:
 * 3 essential capabilities are missing or incomplete."
 *
 * Five of the eighty-two repositories measured read that way, this product's own web
 * application among them. The band comes from the blended score and the verdict from
 * the required-capability gap; they answer different questions and the words do not
 * care. "Production ready" is a claim about readiness, and something the profile calls
 * essential and cannot find is by definition blocking.
 *
 * The third bar on the top band, after thin coverage and an open critical.
 */
describe('the maturity band and the launch verdict do not contradict each other', () => {
  it('never labels a project production ready while calling it not ready to launch', async () => {
    const offenders: string[] = [];

    for (const name of fs.readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
      let report;
      try {
        report = buildReport(await analyzeProject(path.join(FIXTURES, name)), { profile: 'auto' });
      } catch {
        continue;
      }

      if (report.maturityLevel === 'production_ready' && report.executiveSummary.launchReady === false) {
        offenders.push(`${name}: ${report.overallScore}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('caps the score, not only the label', async () => {
    // Both have to move together. The label learned to refuse the top band on thin
    // coverage before the number did, and the number went on reading 98 above every
    // real product in the corpus.
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-secure')), {
      profile: 'b2c-app',
    });
    const gap = report.productProfile?.gap;

    expect((gap?.requiredMissing ?? 0) + (gap?.requiredPartial ?? 0)).toBeGreaterThan(0);
    expect(report.overallScore ?? 0).toBeLessThanOrEqual(84);
    expect(report.maturityLevel).not.toBe('production_ready');
  });

  it('still reaches the top band where nothing essential is missing', async () => {
    // The bar must not swallow the case it exists beside.
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'npm-library')), { profile: 'auto' });

    expect(report.executiveSummary.launchReady).toBe(true);
    expect(report.maturityLevel).toBe('production_ready');
  });
})

/**
 * "Role model: partial", on a product whose every privileged route calls
 * `requireRole(actor, ["owner", "admin"])`.
 *
 * The capability read "permissions present, or roles present and the answer is
 * partial", so a working role model was half-built for want of a separate permission
 * table it never claimed to need. Its own description is "distinct roles so that not
 * every authenticated user can do everything", and its recommendation says "model
 * roles *or* permissions".
 */
describe('a role model is a role model', () => {
  it('accepts roles without a separate permission system', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'express-roles-only')), {
      profile: 'b2b-saas',
    });
    const roles = report.productProfile?.capabilities.find((c) => c.capabilityId === 'authz.roles');

    expect(report.detectedStack.backend).toContain('express');
    expect(roles?.status).toBe('present');
  });

  it('still calls it missing where neither is there', async () => {
    const report = buildReport(await analyzeProject(path.join(FIXTURES, 'saas-with-nothing-but-login')), {
      profile: 'b2b-saas',
    });
    const roles = report.productProfile?.capabilities.find((c) => c.capabilityId === 'authz.roles');

    expect(roles?.status).toBe('missing');
  });
})

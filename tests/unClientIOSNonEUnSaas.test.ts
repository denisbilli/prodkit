import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const read = async (name: string) => {
  const analysis = await analyzeProject(fixture(name));
  return { analysis, report: buildReport(analysis, { profile: 'auto' }) };
};

/**
 * The plan said no real mobile repository had been through the sieve — "the fixtures
 * are mine, so they prove the reader and not the world". Three went through:
 * BlueWallet, thunderbird-android and WordPress-iOS. Two were right. The third found
 * two defects stacked on each other.
 *
 * WordPress-iOS is 2649 Swift files and an Xcode project. It was profiled `b2b-saas`
 * and asked for a health endpoint, security headers, rate limiting and a GDPR export
 * route.
 *
 * First: `backend: ruby`, from a Gemfile holding fastlane and CocoaPods — how the
 * iOS world runs its build. Twenty-three Ruby files among 2675.
 *
 * Second: `organizationID` in `RemoteBlog.swift`, a data class deserialised from
 * WordPress.com's JSON. The application consumes an organization; it does not host
 * one, and it could not — enforcing a boundary between tenants takes a server.
 */
describe('an iOS client of a SaaS is a phone application', () => {
  it('does not read a build Gemfile as a Ruby backend', async () => {
    const { analysis } = await read('ios-client-of-a-saas');

    expect(analysis.stack.backend).toEqual([]);
  });

  it('does not let a tenant word in a client model disqualify it', async () => {
    const { analysis, report } = await read('ios-client-of-a-saas');

    expect(analysis.detectors['tenancy.organization']?.present).toBe(true);
    expect(report.productProfile?.selectedProfile).toBe('mobile-app');
  });

  it('still reports Ruby where Ruby is what the product is written in', async () => {
    // The guard must not swallow the case it exists beside: a Rails application is
    // still a Ruby backend.
    const { analysis } = await read('rails-dev-cors');

    expect(analysis.stack.backend.length).toBeGreaterThan(0);
  });
})

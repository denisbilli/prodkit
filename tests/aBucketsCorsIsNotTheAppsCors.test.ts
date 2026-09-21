import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A bucket's CORS is not the application's CORS.
 *
 * bitwarden's Aspire host configures the local Azurite storage emulator with
 * `AllowedOrigins = [new BicepValue<string>("*")]` inside a `StorageCorsRule`, and
 * that one line made a `high` finding out of an API whose actual policy is
 * `SetIsOriginAllowed(o => CoreHelpers.IsCorsOriginAllowed(o, globalSettings))` — a
 * function deciding, cited two lines below it in the same report. The loudest finding
 * about a password manager was a storage emulator's settings.
 *
 * The subject is different, not the severity: a storage account, a bucket or a CDN
 * distribution answers for the objects it serves, and this check is about the requests
 * this application answers. `StorageCorsRule`, `CorsRules` and S3's `CORSRule` are
 * type names from the cloud SDKs, so they are the anchor rather than the directory.
 *
 * bitwarden goes from 83 and a `high` to 93 and `production_ready`, cited on the line
 * that decides its origins.
 */
describe('a bucket\'s CORS is not the app\'s CORS', () => {
  it('lets the application policy stand beside a wide-open bucket rule', async () => {
    const report = buildReport(await analyzeProject(fixture('bucket-cors-beside-a-policy')), { profile: 'auto' });
    const cors = report.findings.find((f) => f.id === 'security.cors-origin');

    expect(cors?.status).toBe('passed');
    expect(cors?.evidence.some((e) => e.file?.includes('Startup.cs'))).toBe(true);
  });
});

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const finding = async (name: string, id: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'auto' });
  return report.findings.find((f) => f.id === id);
};

/**
 * NestJS says all of this in its own words, and none of them were being read.
 *
 * ghostfolio turns cross-origin on with `app.enableCors()` — bare, which is Nest's
 * default and means every origin — and the one line the report cited was
 * `allowedOrigins: [hostname]` in an MCP module twelve directories away: an allowlist,
 * while the whole API answers anybody. It throttles its sign-in with a
 * `CustomThrottlerGuard` and was told at `medium` that it has no rate limiting at all.
 *
 * Three names do the work, and the author chose none of them: `enableCors` is the
 * framework's method, `@nestjs/throttler` is the package, and `@Controller` is the
 * decorator. What the guard wrapping the throttler is called is the author's business,
 * which is why the search for it has no word boundary and no case — `CustomThrottler`
 * has no boundary before `Throttler`, and `custom-throttler.guard` is lower case.
 */
describe('Nest says it in its own words', () => {
  it('reads a bare enableCors as the every-origin default it is', async () => {
    const cors = await finding('nest-enables-cors', 'security.cors-origin');

    expect(cors?.status).toBe('partial');
    expect(cors?.evidence.some((e) => String(e.value).includes('enableCors'))).toBe(true);
  });

  /**
   * A guard is applied to a class, not to a line. `@UseGuards(CustomThrottlerGuard)`
   * sits nine lines below `@Controller('auth')` in ghostfolio — one past the window
   * that reads a route's own options, and that window is the wrong question anyway.
   */
  it('reads a throttler guard in the controller that declares the sign-in', async () => {
    const limit = await finding('nest-throttles-its-auth', 'security.rate-limit-auth');

    expect(limit?.status).toBe('passed');
    expect(limit?.evidence.some((e) => String(e.value).includes('UseGuards'))).toBe(true);
  });

  /**
   * And the gate in front of all of it: this check read `express` alone and said so,
   * so a NestJS application that does not also declare express — most of them, since
   * `@nestjs/platform-express` is the adapter rather than the framework — got no
   * verdict at all on a capability that is now readable there.
   */
  it('gives a NestJS application a verdict at all', async () => {
    const analysis = await analyzeProject(fixture('nest-throttles-its-auth'));

    expect(analysis.stack.backend).not.toContain('express');
  });
});

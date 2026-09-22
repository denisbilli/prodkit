import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/**
 * The limiter with no package to declare.
 *
 * The Python entries on the rate-limiting list are `django-ratelimit`, `slowapi` and
 * `flask-limiter`, and Django REST Framework is none of them: its throttling ships
 * inside the framework, configured by a settings key rather than installed.
 *
 * `makeplane/plane` throttles every anonymous caller —
 * `"DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.AnonRateThrottle",)`, with
 * the rates beside it — and was told at `high` that it has no rate limiting at all.
 *
 * `djangorestframework` on the dependency list would not be an answer either:
 * installing DRF says nothing about whether anything is throttled. The settings key is
 * the switch, and DRF chose its name.
 */
describe('the throttle inside the framework', () => {
  it('reads throttling off the settings key rather than a package', async () => {
    const analysis = await analyzeProject(path.resolve(__dirname, 'fixtures', 'throttles-inside-the-framework'));

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });
});

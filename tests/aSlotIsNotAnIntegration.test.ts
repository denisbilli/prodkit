import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Laravel's table of service credentials is a list of slots.
 *
 * `config/services.php` ships with the framework and holds a block per service the
 * skeleton knows about — mailgun, postmark, ses, and for years a `stripe` one reading
 * `env('STRIPE_KEY')`. Firefly III still carries it, beside sparkpost, mandrill and
 * pushover, and takes no payments at all: no processor package in its composer.json,
 * no charge anywhere. It was reported at `medium` for an unhardened billing webhook.
 *
 * The rest of that finding was its own webhooks feature — notifications a *user*
 * registers to hear about their own transactions, which point the other way entirely.
 * Two things called webhook, one of them incoming from a payment processor and one
 * outgoing to a person, and the report could not tell them apart because the word is
 * the same.
 *
 * An entry there is a slot the deployment may fill. A project that charges people
 * declares `stripe/stripe-php` or `laravel/cashier`, and that is read from the
 * manifest.
 */
describe('a slot is not an integration', () => {
  it('does not read Laravel\'s services table as a payment integration', async () => {
    const report = buildReport(await analyzeProject(fixture('laravel-service-slots')), { profile: 'auto' });

    expect(report.findings.find((f) => f.id === 'billing.webhook-signature')?.status).toBe('unknown');
  });
});

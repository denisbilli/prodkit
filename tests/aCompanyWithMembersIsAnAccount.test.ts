import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A company that has members is an account.
 *
 * `akaunting/akaunting` is multi-company accounting — `company_id` on every table, a scope
 * that filters by it, and `user_companies` saying who belongs to which company — and was
 * read as a consumer app at high confidence. `companyId` is a weak word on purpose: a CRM
 * stores its customer's company on every contact. What a customer's company never has is
 * a join table of the product's own users.
 */
describe('a company with members is an account', () => {
  it('reads company_id as the tenant when people belong to companies', async () => {
    const analysis = await analyzeProject(fixture('laravel-multi-company'));

    expect(analysis.detectors['tenancy.organization']?.present).toBe(true);
  });

  it('does not read a contact\'s company as a tenant', async () => {
    const analysis = await analyzeProject(fixture('a-customers-company-is-not-a-tenant'));

    expect(analysis.detectors['tenancy.organization']?.present).toBe(false);
  });
});

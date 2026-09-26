import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const SSO = "<?php\n\nreturn [\n    'azure' => [\n        'client_id' => env('SSO_AZURE_CLIENT_ID'),\n        'tenant' => env('SSO_AZURE_TENANT_ID'),\n    ],\n    'zitadel' => [\n        'organization_id' => env('SSO_ZITADEL_ORGANIZATION_ID'),\n    ],\n];\n";

async function tenancyWith(file: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-linkace-'));
  const files: Record<string, string> = {
    'composer.json': JSON.stringify({ require: { 'laravel/framework': '^11.0', 'laravel/socialite': '^5.0' } }),
    [file]: SSO,
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['tenancy.organization']?.present;
}

/**
 * LinkAce configures Azure AD and Zitadel sign-in in Laravel's `config/services.php`, and
 * the identity provider's tenant and organization made it a multi-tenant SaaS.
 */
describe("an identity provider's tenant", () => {
  it("is not the product's, in Laravel's third-party services config", async () => {
    expect(await tenancyWith('config/services.php')).toBe(false);
  });

  it('is still read in the product\'s own code', async () => {
    expect(await tenancyWith('app/Tenancy/settings.php')).toBe(true);
  });
});

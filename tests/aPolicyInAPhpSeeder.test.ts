import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function retentionFrom(code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-linkstack-'));
  await fs.writeFile(path.join(root, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^9.0' } }));
  await fs.mkdir(path.join(root, 'database/seeders'), { recursive: true });
  await fs.writeFile(path.join(root, 'database/seeders/PageSeeder.php'), code);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['gdpr.retention.job']?.present;
}

/** LinkStack seeds a privacy policy as HTML in a PHP string, and that was its retention policy. */
describe('a privacy policy in a PHP seeder', () => {
  it('is copy, not a retention job', async () => {
    expect(await retentionFrom("<?php\n$policy = '\n<p>We will only keep your personal information for as long as it is necessary and then delete personal data promptly.</p>\n';\n")).toBe(false);
  });

  it('leaves the same words in code readable', async () => {
    expect(await retentionFrom("<?php\n// gdpr retention: purge and delete personal data after the period\nPersonalData::where('created_at', '<', now()->subDays(30))->delete();\n")).toBe(true);
  });

  it('does not read a long line of code as copy', async () => {
    expect(await retentionFrom('<?php\nprivacy_retention_job($user, $account, $team, $org, $site, $page, $post, $comment, $file, $tag, $role, $plan);\n')).toBe(true);
  });
});

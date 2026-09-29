import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function retention(model: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-speedtest-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"laravel/framework":"^11.0"}}\n');
  await fs.mkdir(path.join(root, 'app/Models'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/Models/Result.php'), model);
  const found = (await analyzeProject(root)).detectors['gdpr.retention.job']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** speedtest-tracker prunes old results with Laravel's Prunable and read as keeping them forever. */
describe("Laravel's Prunable", () => {
  it('is a retention job', async () => {
    expect(await retention("<?php\n\nnamespace App\\Models;\n\nuse Illuminate\\Database\\Eloquent\\Model;\nuse Illuminate\\Database\\Eloquent\\Prunable;\n\nclass Result extends Model\n{\n    use Prunable;\n\n    public function prunable()\n    {\n        return static::where('created_at', '<=', now()->subDays(config('speedtest.prune_results_older_than')));\n    }\n}\n")).toBe(true);
  });

  it('is a retention job when mass-pruned', async () => {
    expect(await retention("<?php\n\nuse Illuminate\\Database\\Eloquent\\MassPrunable;\n\nclass Result extends Model\n{\n    use MassPrunable;\n}\n")).toBe(true);
  });

  it('is not a model that keeps its rows', async () => {
    expect(await retention("<?php\n\nuse Illuminate\\Database\\Eloquent\\SoftDeletes;\n\nclass Result extends Model\n{\n    use SoftDeletes;\n}\n")).toBe(false);
  });
});

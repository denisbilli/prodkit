import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-snipe-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/** snipe-it records who sold it each laptop; nobody sells through it. */
describe('A supplier', () => {
  it('is not a supply side', async () => {
    const analysis = await analyze({
      'app/Http/Controllers/AccessoriesController.php': '<?php\n$accessory->supplier_id = request(\'supplier_id\');\n',
      'app/Models/Asset.php': '<?php\nclass Asset {\n    public function supplier() { return $this->belongsTo(Supplier::class, \'supplier_id\'); }\n}\n',
    });

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(false);
  });

  it('is not a seller, who still is', async () => {
    const analysis = await analyze({
      'app/Http/Controllers/ListingsController.php': '<?php\n$listing->seller_id = request(\'seller_id\');\n',
      'app/Models/Listing.php': '<?php\nclass Listing {\n    public function seller() { return $this->belongsTo(Seller::class, \'seller_id\'); }\n}\n',
    });

    expect(analysis.detectors['marketplace.multiRole']?.present).toBe(true);
  });
});

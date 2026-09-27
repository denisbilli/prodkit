import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** Ghost limits sign-in attempts with express-brute and was told at `high` that it does not throttle. */
describe('express-brute', () => {
  it('is rate limiting', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-ghost-'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'ghost', dependencies: { express: '^4.21.0', 'express-brute': '1.0.1' } }));
    await fs.mkdir(path.join(root, 'core'), { recursive: true });
    await fs.writeFile(path.join(root, 'core/spam-prevention.js'), "const ExpressBrute = require('express-brute');\n");
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['security.core']?.details?.rateLimit).toBe(true);
  });
});

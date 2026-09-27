import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/**
 * YOURLS signs its admins in with PHP's own `password_verify`, and was reported as having
 * authentication with nothing but "searched for a way for somebody to sign in" as evidence.
 */
describe('sign-in found by the password it hashes', () => {
  it('cites the hashing line', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-yourls-'));
    await fs.mkdir(path.join(root, 'includes'), { recursive: true });
    await fs.writeFile(path.join(root, 'includes/functions-auth.php'), '<?php\nfunction yourls_check_password_hash($user, $submitted) {\n    return password_verify($submitted, $hash);\n}\n');
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    const core = analysis.detectors['auth.core'];
    expect(core?.present).toBe(true);
    expect(core?.evidence.some((item) => item.type === 'snippet' && /password_verify/.test(String(item.value)))).toBe(true);
  });
});

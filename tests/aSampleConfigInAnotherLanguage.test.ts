import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/**
 * lldap is a Rust LDAP server whose `example_configs/` holds sample configurations for
 * the applications people connect to it — one of them `xbackbone_config.php`. That one
 * file made PHP a backend of a Rust server.
 */
describe('a sample configuration in another language', () => {
  it('does not make a Rust server a PHP backend', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-php-'));
    const files: Record<string, string> = {
      'Cargo.toml': '[package]\nname = "directory"\nversion = "0.1.0"\n\n[dependencies]\nactix-web = "4"\n',
      'example_configs/xbackbone_config.php': "<?php\nreturn ['ldap' => ['enabled' => true]];\n",
    };
    for (let i = 0; i < 25; i++) files[`src/handlers/h${i}.rs`] = `pub fn handler_${i}() {}\n`;
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(root, name);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content);
    }

    const frameworks = ((await analyzeProject(root)).detectors['stack.backend']?.details?.frameworks as string[] | undefined) ?? [];
    await fs.rm(root, { recursive: true, force: true });

    expect(frameworks).not.toContain('php');
  });
});

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-tolgee-'));
  const gradle = 'dependencies {\n    implementation("org.springframework.boot:spring-boot-starter-web")\n    implementation("org.springframework.boot:spring-boot-starter-security")\n}\n';
  for (const [name, content] of Object.entries({ 'backend/app/build.gradle': gradle, ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

/**
 * tolgee's Spring Security chain is written in Kotlin, `httpSecurity: HttpSecurity`, and it
 * was told at `high` to add security headers; Kotlin's `jvmErasure` was its erasure flow.
 */
describe('tolgee', () => {
  it('reads a Kotlin security filter chain', async () => {
    const analysis = await analyze({
      'backend/app/src/main/kotlin/io/tolgee/configuration/WebSecurityConfig.kt': 'class WebSecurityConfig {\n  fun securityFilterChain(httpSecurity: HttpSecurity): SecurityFilterChain {\n    return httpSecurity.build()\n  }\n}\n',
    });

    expect(analysis.detectors['security.core']?.details?.helmet).toBe(true);
  });

  it('does not read type erasure as data erasure', async () => {
    const analysis = await analyze({ 'backend/api/src/main/kotlin/io/tolgee/Docs.kt': 'import kotlin.reflect.jvm.jvmErasure\n' });

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(false);
  });

  it('still reads erasure as a word', async () => {
    const analysis = await analyze({ 'backend/api/src/main/kotlin/io/tolgee/Privacy.kt': 'fun requestErasure(user: User) = privacy.schedule(user)\n' });

    expect(analysis.detectors['gdpr.erasure.route']?.present).toBe(true);
  });
});

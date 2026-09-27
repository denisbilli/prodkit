import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function rateLimitFrom(body: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-commafeed-'));
  await fs.writeFile(path.join(root, 'pom.xml'), '<project><dependencies><dependency><groupId>io.quarkus</groupId><artifactId>quarkus-rest</artifactId></dependency></dependencies></project>\n');
  await fs.mkdir(path.join(root, 'src/main/java/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/main/java/app/Getter.java'), `package app;\n\npublic class Getter {\n    void check(Response response) {\n${body}\n    }\n}\n`);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['security.core']?.details?.rateLimit;
}

/** commafeed re-throws the 429 a feed server sent it, and that was its rate limiting. */
describe('a 429 thrown on', () => {
  it('is received when a status comparison comes first', async () => {
    expect(await rateLimitFrom('        int code = response.code();\n        if (code == HttpStatus.SC_TOO_MANY_REQUESTS) {\n            throw new TooManyRequestsException(response.retryAfter());\n        }')).toBe(false);
  });

  it('is received when the number is compared', async () => {
    expect(await rateLimitFrom('        if (response.code() == 429) {\n            throw new TooManyRequestsException(0);\n        }')).toBe(false);
  });

  it('is issued when nothing read one', async () => {
    expect(await rateLimitFrom('        if (attempts.get(user) > 5) {\n            throw new TooManyRequestsException(60);\n        }')).toBe(true);
  });
});

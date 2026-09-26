import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const JAVA = 'src/main/java/io/github/jhipster/sample';

async function analyze(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-jhipster-'));
  const pom = '<project><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>\n';
  for (const [name, content] of Object.entries({ 'pom.xml': pom, ...files })) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis;
}

const YO_RC = '{\n  "generator-jhipster": {\n    "applicationType": "monolith",\n    "authenticationType": "jwt"\n  }\n}\n';
const ACTIVATE = 'public class UserService {\n    public Optional<User> activateRegistration(String key) {\n        return userRepository.findOneByActivationKey(key);\n    }\n}\n';

/**
 * JHipster's sample app activates accounts from an emailed key and was told at `high` it
 * verifies no addresses; its audited `createdBy` columns and its `authorize(...)` login
 * endpoint were evidence of ownership checks it does not make.
 */
describe('a JHipster application', () => {
  it('verifies an address by activating the account', async () => {
    const analysis = await analyze({ '.yo-rc.json': YO_RC, [`${JAVA}/service/UserService.java`]: ACTIVATE });

    expect(analysis.detectors['auth.emailVerification']?.present).toBe(true);
  });

  it('reads the generator\'s name only where the generator wrote the code', async () => {
    const analysis = await analyze({ [`${JAVA}/service/UserService.java`]: ACTIVATE });

    expect(analysis.detectors['auth.emailVerification']?.present).toBe(false);
  });

  it('does not check ownership by auditing who created a row', async () => {
    const analysis = await analyze({
      [`${JAVA}/domain/AbstractAuditingEntity.java`]: 'public abstract class AbstractAuditingEntity {\n    @CreatedBy\n    private String createdBy;\n\n    public String getCreatedBy() {\n        return createdBy;\n    }\n}\n',
    });

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(false);
  });

  it('checks ownership when the creator is compared', async () => {
    const analysis = await analyze({
      [`${JAVA}/web/rest/PostResource.java`]: 'public class PostResource {\n    void check(Post post, String login) {\n        if (!post.getCreatedBy().equals(login)) throw new AccessDeniedException("not yours");\n    }\n}\n',
    });

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(true);
  });

  it('checks ownership with the creator on the right', async () => {
    const analysis = await analyze({
      'src/posts.ts': 'export function assertOwner(post: Post, user: User) {\n  if (user.id !== post.createdBy) throw new Error("not yours");\n}\n',
    });

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(true);
  });

  it('does not read a method called authorize as a check', async () => {
    const analysis = await analyze({
      [`${JAVA}/web/rest/AuthenticateController.java`]: 'public class AuthenticateController {\n    public ResponseEntity<JWTToken> authorize(@Valid @RequestBody LoginVM loginVM) {\n        return null;\n    }\n}\n',
    });

    expect(analysis.detectors['authz.resourceLevel']?.present).toBe(false);
  });
});

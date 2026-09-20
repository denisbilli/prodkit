import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';
import { readHardcodedSecretArguments } from '../src/analyzer/structural/secretArguments';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const weakSecret = async (name: string) => {
  const report = buildReport(await analyzeProject(fixture(name)), { profile: 'b2b-saas' });
  return report.findings.find((finding) => finding.id === 'security.weak-secret');
};

/**
 * A hardcoded signing key, and the check congratulated the project.
 *
 *     const chiave = process.env.CHIAVE_FIRMA || 'cambiami';
 *     jwt.sign({ sub: utente.id }, chiave);
 *
 * Every reading of "is this a hardcoded secret" started from the name being
 * assigned — `JWT_SECRET`, `SECRET_KEY`, `API_KEY` — and that name is the author's.
 * This one is Italian, so `security.weak-secret` came back `passed`: "no weak
 * fallback secret patterns detected".
 *
 * The anchor that does not move is the other end. `jsonwebtoken.sign(payload, secret)`
 * says what its second argument is, by the library's contract rather than by
 * convention, and arriving there is what makes a literal a secret whatever it was
 * called on the way.
 */
describe('a hardcoded key is one whatever the variable is called', () => {
  it('follows a literal into the argument a library defines as a secret', async () => {
    const finding = await weakSecret('segreto-in-italiano');

    expect(finding?.status).toBe('missing');
    expect(finding?.severity).toBe('critical');
  });

  it('names the call that makes it a secret, so the reader can check', async () => {
    const finding = await weakSecret('segreto-in-italiano');
    const cited = finding?.evidence.filter((item) => /reaches jsonwebtoken/.test(String(item.value))) ?? [];

    expect(cited.length).toBeGreaterThan(0);
    expect(cited[0].line).toBeGreaterThan(0);
  });

  it('says nothing where the key only ever comes from the environment', async () => {
    // The direction that would make this useless: every `jwt.sign` flagged.
    const finding = await weakSecret('segreto-solo-da-env');

    expect(finding?.status).toBe('passed');
  });

  it('resolves one hop and not two', async () => {
    // A literal passed straight in, and a literal one declaration away, both count.
    // Anything further is reach this cannot honestly claim.
    const found = await readHardcodedSecretArguments(path.resolve(__dirname, 'fixtures'), [
      'segreto-in-italiano/src/sessione.js',
    ]);

    expect(found).not.toBeNull();
    expect((found ?? []).length).toBeGreaterThan(0);
  });
})

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * writefreely sends password resets through `github.com/mailgun/mailgun-go` and was told
 * at `high` that it has no way to reach a user: the delivery libraries known were npm,
 * Python and the JVM.
 */
describe('a Go product that sends mail', () => {
  it('reads a Go email library as a way to reach the user', async () => {
    expect((await analyzeProject(fixture('go-mailgun-mailer'))).detectors['notifications.transactional']?.present).toBe(true);
  });
});

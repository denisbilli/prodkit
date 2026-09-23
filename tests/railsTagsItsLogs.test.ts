import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * Rails tags every log line with the request when told to.
 *
 * `config.log_tags = [:request_id]` prefixes each line with the id
 * `ActionDispatch::RequestId` gave the request — correlation, configured rather than
 * written. `chatwoot/chatwoot` has it in production.rb and read as `partial` for want of a
 * hyphenated header name.
 */
describe('Rails tags its logs', () => {
  it('counts log_tags carrying the request id', async () => {
    const analysis = await analyzeProject(fixture('rails-tags-its-logs'));

    expect(analysis.detectors['observability.core']?.details?.requestId).toBe(true);
  });

  /** Rails generates that line commented out in some versions; a comment tags nothing. */
  it('does not count the line commented out', async () => {
    const analysis = await analyzeProject(fixture('rails-logs-untagged'));

    expect(analysis.detectors['observability.core']?.details?.requestId).toBe(false);
  });
});

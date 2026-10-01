import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function rateLimit(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-jellyfin-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'server', dependencies: { express: '4.19.0' } }));
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  const found = (await analyzeProject(root)).detectors['security.core']?.details?.rateLimit;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Jellyfin documents Retry-After on its 503 and reads a 429 from MusicBrainz, and was credited with a rate limit. */
describe('Retry-After', () => {
  it('is not a rate limit on a 503', async () => {
    expect(await rateLimit({ 'src/maintenance.js': "module.exports = (req, res) => {\n  res.setHeader('Retry-After', 120);\n  res.sendStatus(503);\n};\n" })).toBe(false);
  });

  it('is not one on a 503 in lower case either', async () => {
    expect(await rateLimit({ 'src/maintenance.js': "module.exports = (req, res) => {\n  res.set({ 'retry-after': '120' });\n  res.sendStatus(503);\n};\n" })).toBe(false);
  });

  it('is one beside a 429', async () => {
    expect(await rateLimit({ 'src/limiter.js': "const TOO_MANY = 429;\nmodule.exports = (req, res) => {\n  res.writeHead(TOO_MANY, { 'Retry-After': '60' });\n  res.end();\n};\n" })).toBe(true);
  });
});

describe("C#'s pattern match on a status", () => {
  it('is a 429 received', async () => {
    expect(await rateLimit({ 'src/Client.cs': 'internal static class Retry\n{\n    public static bool ShouldRetry(HttpStatusCode status)\n        => status is HttpStatusCode.TooManyRequests;\n}\n' })).toBe(false);
  });
});

/** gotosocial's throttle and memos's gRPC limiter both send Retry-After beside the status in its own spelling. */
describe('Retry-After beside a 429 spelled otherwise', () => {
  it('is a rate limit with a TooManyRequests constant', async () => {
    expect(await rateLimit({ 'internal/throttling.go': 'package middleware\n\nfunc throttle(c *httputil.Context) {\n\tc.W.Header().Set("Retry-After", retryAfterStr)\n\thttputil.Data(c,\n\t\thttp.StatusTooManyRequests,\n\t\tapiutil.AppJSON,\n\t)\n}\n' })).toBe(true);
  });

  it("is a rate limit with gRPC's ResourceExhausted", async () => {
    expect(await rateLimit({ 'server/ratelimit.go': 'package v1\n\nfunc limited(header metadata.MD) error {\n\theader.Set("Retry-After", "30")\n\treturn status.New(codes.ResourceExhausted, "too many requests").Err()\n}\n' })).toBe(true);
  });
});

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function corsFrom(body: string, importLine = '"github.com/rs/cors"') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-gotosocial-'));
  await fs.writeFile(path.join(root, 'go.mod'), 'module example.org/social\n\ngo 1.23\n\nrequire github.com/rs/cors v1.11.1\n');
  await fs.mkdir(path.join(root, 'internal/middleware'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'internal/middleware/cors.go'),
    `package middleware\n\nimport (\n\t"net/http"\n\n\t${importLine}\n)\n\nfunc CORS(next http.Handler) http.Handler {\n${body}\n}\n`,
  );
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  const details = analysis.detectors['security.core']?.details ?? {};
  return { strict: details.corsStrict, loose: details.corsLoose };
}

/** gotosocial configures rs/cors and was told at `high` it has no cross-origin configuration. */
describe('rs/cors', () => {
  it('reads a function that decides as a choice', async () => {
    expect((await corsFrom('\treturn cors.New(cors.Options{\n\t\tAllowOriginFunc: func(origin string) bool { return true },\n\t}).Handler(next)')).strict).toBe(true);
  });

  it('reads named origins as a choice', async () => {
    expect((await corsFrom('\treturn cors.New(cors.Options{\n\t\tAllowedOrigins: []string{"https://app.example.org"},\n\t}).Handler(next)')).strict).toBe(true);
  });

  it('reads every origin as open', async () => {
    expect((await corsFrom('\treturn cors.New(cors.Options{\n\t\tAllowedOrigins: []string{"*"},\n\t}).Handler(next)')).loose).toBe(true);
  });

  it('reads AllowAll and Default as open', async () => {
    expect((await corsFrom('\treturn cors.AllowAll().Handler(next)')).loose).toBe(true);
    expect((await corsFrom('\treturn cors.Default().Handler(next)')).loose).toBe(true);
  });

  it('is only rs/cors', async () => {
    const other = await corsFrom('\treturn cors.New(cors.Options{\n\t\tAllowOriginFunc: func(origin string) bool { return true },\n\t}).Handler(next)', '"example.org/cors"');
    expect(other.strict).toBe(false);
  });
});

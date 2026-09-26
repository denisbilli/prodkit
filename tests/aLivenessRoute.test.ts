import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function healthFrom(route: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-shiori-'));
  await fs.writeFile(path.join(root, 'go.mod'), 'module github.com/go-shiori/shiori\n\ngo 1.23\n');
  await fs.mkdir(path.join(root, 'internal/http'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'internal/http/server.go'),
    `package http\n\nfunc (s *HttpServer) Setup() {\n\ts.mux.HandleFunc("GET ${route}", handleLiveness)\n}\n\nfunc handleLiveness(w http.ResponseWriter, r *http.Request) {}\n`,
  );
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['observability.core']?.details?.healthEndpoint;
}

/** shiori answers `GET /system/liveness` and was told it has no health endpoint. */
describe("Kubernetes' probe names as routes", () => {
  it('reads a liveness route', async () => {
    expect(await healthFrom('/system/liveness')).toBe(true);
  });

  it('reads a readiness route', async () => {
    expect(await healthFrom('/system/readiness')).toBe(true);
  });

  it('reads neither in another route', async () => {
    expect(await healthFrom('/system/info')).toBe(false);
  });
});

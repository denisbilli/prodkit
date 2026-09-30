import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';
import { evidenceOrFileNameSearch } from './absenceEvidence';

/**
 * The container the editor opens is not the container the product ships in.
 *
 * `.devcontainer/` is the Development Containers convention — VS Code, Codespaces and
 * anything else that implements containers.dev read it to build the environment a
 * *contributor* works in. n8n has one, and it sorted ahead of
 * `docker/images/n8n/Dockerfile`, so the report answered "how does this ship" with the
 * development environment: the wrong file cited, and the HEALTHCHECK question asked of
 * a Dockerfile that has no reason to answer it.
 *
 * The first match in path order decided before, which is no decision at all. The
 * shallowest of the real ones is the project's own, the same tie-break the package
 * manager uses.
 *
 * A repository whose only container definition is its devcontainer keeps it rather
 * than losing the answer: nothing that used to resolve stops resolving.
 */
const DEVELOPMENT_CONTAINER = /(^|\/)\.devcontainer\//;

/**
 * And a directory named for development, the same convention as a `.dev` suffix below.
 * InvoiceShelf keeps `docker/development/` and `docker/production/` side by side, each
 * with a Dockerfile at the same depth, and path order cited the development one.
 */
const DEVELOPMENT_DIRECTORY = /(^|\/)development\//;

function theShippedOne(candidates: string[], workspaceImages: string[] = []): string | undefined {
  const shipped = candidates.filter(
    (file) => !DEVELOPMENT_CONTAINER.test(file) && !DEVELOPMENT_DIRECTORY.test(file) && !workspaceImages.includes(file),
  );
  const pool = shipped.length > 0 ? shipped : candidates;

  return pool.reduce<string | undefined>(
    (best, file) => (best === undefined || file.split('/').length < best.split('/').length ? file : best),
    undefined,
  );
}

/**
 * The image Gitpod builds a workspace from, named in `.gitpod.yml` as `image: file: <path>`.
 *
 * PeerTube keeps `support/docker/gitpod/Dockerfile` beside `support/docker/production/`,
 * at the same depth, and path order cited the Gitpod one — the contributor's cloud editor,
 * which `.gitpod.yml` says in so many words.
 */
async function gitpodImages(ctx: DetectContext): Promise<string[]> {
  const text = (await readTextFileSafe(ctx.root, '.gitpod.yml')) ?? '';
  const named = /^image:\s*\n\s+file:\s*(\S+)/m.exec(text);
  return named ? [named[1]] : [];
}

export async function detectDocker(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const workspaceImages = await gitpodImages(ctx);
  /**
   * `docker build -f` takes any name, and the convention is a suffix. flaskbb ships
   * `docker/Dockerfile.release` and `docker/compose.release.yaml` beside their `.dev`
   * twins, with HEALTHCHECKs in both, and was told it has no container definition. The
   * plain names still win where they exist, and a `.dev` twin is the development one,
   * cited only when nothing else is there — the same reason `.devcontainer/` loses.
   */
  const plainOrSuffixed = (plain: RegExp, suffixed: RegExp) => {
    const exact = ctx.files.all.filter((f) => plain.test(f));
    if (exact.length > 0) return theShippedOne(exact, workspaceImages);
    const named = ctx.files.all.filter((f) => suffixed.test(f));
    const shipped = named.filter((f) => !/\.(?:dev|development|local)(?:\.ya?ml)?$/i.test(f));
    return theShippedOne(shipped.length > 0 ? shipped : named);
  };
  // Lower case too, and `<name>.dockerfile`: uptime-kuma builds from docker/dockerfile.
  const dockerfile = plainOrSuffixed(/(^|\/)[Dd]ockerfile$/, /(^|\/)(?:Dockerfile\.[\w-]+|[\w-]+\.dockerfile)$/);
  const composeFile = plainOrSuffixed(/(^|\/)(docker-compose\.ya?ml|compose\.ya?ml)$/, /(^|\/)(docker-)?compose\.[\w-]+\.ya?ml$/);

  let hasHealthcheck = false;
  let hasExpose = false;
  let services: string[] = [];

  if (dockerfile) {
    evidence.push({ type: 'file', value: dockerfile });
    const text = (await readTextFileSafe(ctx.root, dockerfile)) ?? '';
    if (/^HEALTHCHECK\s+/im.test(text)) {
      hasHealthcheck = true;
      evidence.push({ type: 'snippet', value: 'HEALTHCHECK found', file: dockerfile });
    }
    if (/^EXPOSE\s+/im.test(text)) {
      hasExpose = true;
      evidence.push({ type: 'snippet', value: 'EXPOSE found', file: dockerfile });
    }
  }

  if (composeFile) {
    evidence.push({ type: 'file', value: composeFile });
    const text = (await readTextFileSafe(ctx.root, composeFile)) ?? '';
    // Not in a comment: InvoiceShelf's SQLite compose offers `#   healthcheck: {...}` as
    // something to switch on, and a line nobody uncommented checks nothing.
    if (/^[^#]*healthcheck\s*:/m.test(text)) {
      hasHealthcheck = true;
      evidence.push({ type: 'snippet', value: 'healthcheck block in compose', file: composeFile });
    }
    const lower = text.toLowerCase();
    services = ['postgres', 'redis', 'nginx'].filter((s) => lower.includes(s));
    for (const s of services) evidence.push({ type: 'snippet', value: `${s} service in compose`, file: composeFile });
  }

  return {
    key: 'infra.docker',
    present: Boolean(dockerfile || composeFile),
    complete: hasHealthcheck,
    evidence: evidenceOrFileNameSearch(evidence, 'a container definition', ['Dockerfile', 'Containerfile', 'docker-compose.yml', 'compose.yaml']),
    details: { dockerfile: Boolean(dockerfile), compose: Boolean(composeFile), hasHealthcheck, hasExpose, services },
  };
}

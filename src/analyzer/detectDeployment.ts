import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { evidenceOrFileNameSearch } from './absenceEvidence';

export async function detectDeployment(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  /**
   * What a project ships to say how it is run.
   *
   * The list held six names and missed the one that mattered on a real product:
   * `docker-compose.prod.yml`, a production override with its usage documented in the
   * first three lines. Continuous integration outside GitHub was invisible too, and so
   * was every platform descriptor.
   */
  const keyFiles = [
    'Dockerfile', 'Containerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml',
    'Procfile', 'nginx.conf', 'fly.toml', 'render.yaml', 'railway.json', 'vercel.json', 'netlify.toml',
    'app.yaml', 'Makefile', 'skaffold.yaml', 'Chart.yaml',
    /**
     * How a phone application ships. Its deployment story is a store pipeline, not a
     * container: `Fastfile`, a Codemagic configuration, signing material and an export
     * options plist are the artifacts that decide whether a release is reproducible.
     */
    'codemagic.yaml', 'Fastfile', 'Appfile', 'ExportOptions.plist', 'key.properties',
  ];
  const presentFiles = ctx.files.all.filter((f) =>
    keyFiles.some((k) => f.endsWith(k))
    // A compose override, whatever it is called: docker-compose.prod.yml, compose.staging.yaml.
    || /(^|\/)(docker-)?compose\.[\w.-]+\.ya?ml$/i.test(f)
    || f.startsWith('.github/workflows/')
    || /(^|\/)(\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile|\.woodpecker\.ya?ml)$/i.test(f)
    || /(^|\/)(k8s|kubernetes|helm|deploy|\.platform)\//i.test(f),
  );
  for (const f of presentFiles.slice(0, 20)) evidence.push({ type: 'file', value: f });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [
      /SIGTERM/i, /SIGINT/i,
      /**
       * How a project knows which environment it is in.
       *
       * This was `NODE_ENV` and `DEBUG = False` — Node and Django — so a PHP product
       * reading `APP_ENV` and shipping a production compose override was reported as
       * having no production-aware configuration at all. Every stack has a name for
       * this and none of them is NODE_ENV.
       *
       * `DJANGO_SETTINGS_MODULE` is deliberately absent: `os.environ.setdefault` of it
       * sits in every `manage.py` and `wsgi.py` Django has ever generated, so counting
       * it made a project with no Docker, no CI and `DEBUG = True` report a complete
       * deployment story on the strength of its own boilerplate.
       */
      /\b(NODE_ENV|APP_ENV|RAILS_ENV|RACK_ENV|ASPNETCORE_ENVIRONMENT|FLASK_ENV|GIN_MODE|ENVIRONMENT|PHP_ENV|ENV_NAME|DEPLOY_ENV)\b/,
      /DEBUG\s*=\s*False/,
      /healthcheck/i,
    ],
    20
  );
  for (const m of hits) evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });

  /**
   * Graceful shutdown is a question about a long-lived process.
   *
   * PHP-FPM and CGI hand each request to a worker that exits when it is done; there is
   * no signal for the application to catch, and asking for one is a Node and Go idiom
   * pointed at a process model that does not have it.
   *
   * Decided on the presence of PHP alone: a PHP product's `public/js` does not change
   * how its requests are served, and requiring the absence of JavaScript meant no real
   * PHP application ever qualified.
   */
  /** PHP-FPM hands each request to a worker that exits when it is done. */
  const perRequestRuntime = ctx.files.source.some((f) => f.endsWith('.php'));

  const graceful = hits.some((h) => /SIGTERM|SIGINT/i.test(h.snippet));

  /**
   * A file that exists only to describe production is production awareness, whatever
   * the source says. It is also the more reliable signal of the two.
   */
  const productionDescriptor = presentFiles.some((f) => /prod|production/i.test(f));
  const prodAware = productionDescriptor
    || hits.some((h) => /\b(NODE_ENV|APP_ENV|RAILS_ENV|RACK_ENV|ASPNETCORE_ENVIRONMENT|FLASK_ENV|GIN_MODE|ENVIRONMENT|PHP_ENV|ENV_NAME|DEPLOY_ENV)\b/.test(h.snippet) || /DEBUG\s*=\s*False/.test(h.snippet));

  return {
    key: 'deployment.readiness',
    present: presentFiles.length > 0 || hits.length > 0,
    complete: prodAware,
    evidence: evidenceOrFileNameSearch(evidence, 'anything that says how this is deployed', ['Dockerfile', 'docker-compose', '.github/workflows/', 'Procfile', 'fly.toml', 'render.yaml', 'NODE_ENV', 'RAILS_ENV', 'ASPNETCORE_ENVIRONMENT', 'a file naming production']),
    details: {
      dockerArtifacts: presentFiles.some((f) => /Dockerfile|compose/.test(f)),
      ci: presentFiles.some((f) => f.startsWith('.github/workflows/')),
      gracefulShutdown: graceful,
      /** False where the runtime hands each request to a worker that exits on its own. */
      gracefulShutdownApplies: !perRequestRuntime,
      productionAware: prodAware,
    },
  };
}

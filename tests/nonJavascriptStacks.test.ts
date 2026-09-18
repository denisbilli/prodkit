import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-stacks-'));
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), content);
  }
  return root;
}

/**
 * Read a PHP product I had not looked at before. Two of its findings were wrong in the
 * same way: a check written for one language's idiom, applied to every language.
 */
describe('a check written for JavaScript is not a check', () => {
  it('sees logging that is not called logger.info', async () => {
    // "No structured logging dependency detected", about an application whose global
    // exception handler writes every exception to error_log. Go, Java, Ruby and Rust
    // were invisible for the same reason.
    const report = buildReport(await analyzeProject(fixture('php-monolith')), { profile: 'b2c-app' });
    const logging = report.findings.find((f) => f.id === 'observability.logging');

    expect(logging?.status).toBe('partial');
    expect(logging?.description).toMatch(/unstructured/i);
  });

  it('still separates logging from logging a machine can read', async () => {
    // `error_log($e)` answers "will we know this happened" and not "can we correlate
    // it with a request". Reporting it as present would make the recommendation wrong.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });
    const logging = report.findings.find((f) => f.id === 'observability.logging');

    expect(logging?.status).toBe('passed');
  });

  it('reports nothing at all as nothing at all', async () => {
    const root = await project({
      'composer.json': '{"name":"x/y","require":{"php":">=8.2"}}',
      'src/Controllers/HomeController.php': '<?php\nclass HomeController { public function index() { echo "hi"; } }\n',
    });

    const report = buildReport(await analyzeProject(root), { profile: 'b2c-app' });
    expect(report.findings.find((f) => f.id === 'observability.logging')?.status).toBe('missing');

    await fs.rm(root, { recursive: true, force: true });
  });
});

/**
 * `controllers` and `routes` used to count as an API surface, which meant every
 * application organised the way almost every application is organised was asked for a
 * cross-origin policy.
 */
describe('who is expected to call this', () => {
  it('does not ask a server-rendered PHP monolith for a cross-origin policy', async () => {
    // Pages rendered from templates, a JSON helper for its own AJAX, and
    // `src/Controllers/` — told at high severity that cross-origin access was
    // unrestricted. The Django monolith escaped it only because Django spells the same
    // directory `views`.
    const report = buildReport(await analyzeProject(fixture('php-monolith')), { profile: 'b2c-app' });
    const cors = report.findings.filter((f) => /CORS/i.test(f.title) && f.status === 'missing');

    expect(cors).toEqual([]);
  });

  it('still asks an API server that renders no page', async () => {
    const root = await project({
      'package.json': '{"name":"api","dependencies":{"express":"^4.18.0"}}',
      'src/routes/users.js': "const express = require('express');\nconst router = express.Router();\nrouter.get('/users', (req, res) => res.json([]));\nmodule.exports = router;\n",
    });

    const report = buildReport(await analyzeProject(root), { profile: 'b2b-saas' });
    expect(report.findings.some((f) => /CORS/i.test(f.title) && f.status === 'missing')).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('lets the framework answer when the templates are not in the repository', async () => {
    // Reading it from the file listing alone was too fragile: a Django project whose
    // templates live elsewhere looked like an API server and got asked again.
    const root = await project({
      'requirements.txt': 'django==5.0\n',
      'app/urls.py': "from django.urls import path\nurlpatterns = []\n",
      'app/views.py': "from django.shortcuts import render\n\ndef home(request):\n    return render(request, 'home.html')\n",
    });

    const report = buildReport(await analyzeProject(root), { profile: 'b2c-app' });
    expect(report.findings.filter((f) => /CORS/i.test(f.title) && f.status === 'missing')).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });
});

/**
 * A project with a Dockerfile, a compose file and a documented production override was
 * reported as having an incomplete deployment story. The check looked for `NODE_ENV`
 * and `DEBUG = False`.
 */
describe('how a project says it is going to production', () => {
  it('counts a production compose override', async () => {
    const root = await project({
      'composer.json': '{"name":"x/y","require":{"php":">=8.2"}}',
      'src/Controllers/HomeController.php': '<?php\nclass HomeController { public function index() { echo "hi"; } }\n',
      'Dockerfile': 'FROM php:8.2-fpm\nEXPOSE 9000\n',
      'docker-compose.yml': 'services:\n  web:\n    build: .\n',
      'docker-compose.prod.yml': '# Production override\nservices:\n  web:\n    restart: always\n',
    });

    const analysis = await analyzeProject(root);
    expect(analysis.detectors['deployment.readiness']?.details?.productionAware).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not count boilerplate every project of that framework ships', async () => {
    // `os.environ.setdefault("DJANGO_SETTINGS_MODULE", …)` sits in every manage.py and
    // wsgi.py Django has ever generated. Counting it made a project with no Docker, no
    // CI and DEBUG = True report a complete deployment story on its own boilerplate.
    const root = await project({
      'requirements.txt': 'django==5.0\n',
      'manage.py': 'import os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")\n',
      'app/wsgi.py': 'import os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")\n',
    });

    const analysis = await analyzeProject(root);
    expect(analysis.detectors['deployment.readiness']?.details?.productionAware).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('does not ask a per-request runtime to handle a shutdown signal', async () => {
    // PHP-FPM hands each request to a worker that exits when it is done; there is no
    // signal for the application to catch.
    const report = buildReport(await analyzeProject(fixture('php-monolith')), { profile: 'b2c-app' });
    const deployment = report.findings.find((f) => f.id === 'deployment.readiness');

    expect(deployment?.recommendation ?? '').not.toMatch(/graceful shutdown/i);
  });
});

describe('a check that passed', () => {
  it('does not tell the reader to do what they already did', async () => {
    // Every one of the thirty passed checks across four real reports carried an
    // instruction to add what the project already has.
    const report = buildReport(await analyzeProject(fixture('express-secure')), { profile: 'b2b-saas' });
    const passed = report.findings.filter((f) => f.status === 'passed');

    expect(passed.length).toBeGreaterThan(0);
    for (const finding of passed) {
      expect(finding.recommendation, `${finding.id}`).toBe('');
    }
  });

  it('leaves the instruction on a check that did not', async () => {
    const report = buildReport(await analyzeProject(fixture('express-basic')), { profile: 'b2b-saas' });
    const open = report.findings.filter((f) => f.status === 'missing');

    expect(open.length).toBeGreaterThan(0);
    for (const finding of open) {
      expect(finding.recommendation.length, `${finding.id}`).toBeGreaterThan(0);
    }
  });
});

/**
 * Verified what the unreleased batch newly reports, not only what it stops reporting.
 * Three repositories gained a cross-origin finding they should not have.
 */
describe('a page framework is not an API server', () => {
  it('does not ask a Streamlit application to restrict cross-origin access', async () => {
    // Streamlit, Gradio, Dash and Chainlit exist to render a page. They were added to
    // the backend catalogue and not to the list of frameworks that serve pages, so a
    // one-file Streamlit application was treated as an API server.
    const root = await project({
      'main.py': 'import streamlit as st\nimport openai\n\nst.title("Ask")\n',
    });

    const report = buildReport(await analyzeProject(root), { profile: 'ai-saas' });
    expect(report.findings.filter((f) => /CORS/i.test(f.title) && f.status === 'missing')).toEqual([]);

    await fs.rm(root, { recursive: true, force: true });
  });
});

/**
 * `apiKey` and `API_KEY` matched a key a project holds as readily as one it checks, and
 * almost every project that calls a model has one of its own.
 */
describe('a key you hold is not a key you check', () => {
  it('does not read an outbound credential as an API of your own', async () => {
    // `--api-key YOUR_API_KEY_HERE`, in the usage text of a script that downloads from
    // YouTube, was enough to decide a one-page application offers an API to other
    // callers — and to ask it to restrict cross-origin access to it.
    const root = await project({
      'requirements.txt': 'requests\n',
      'download.py': 'import argparse\n\nparser = argparse.ArgumentParser()\nparser.add_argument("--api-key", help="--api-key YOUR_API_KEY_HERE")\nAPI_KEY = "set me"\n',
    });

    const analysis = await analyzeProject(root);
    expect(analysis.detectors['auth.apiKeys']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads a key taken out of an incoming request', async () => {
    const root = await project({
      'package.json': '{"name":"api","dependencies":{"express":"^4.18.0"}}',
      'src/auth.js': "function guard(req, res, next) {\n  const key = req.headers['x-api-key'];\n  if (!key) return res.status(401).end();\n  next();\n}\nmodule.exports = { guard };\n",
    });

    const analysis = await analyzeProject(root);
    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('reads a store of keys you issued', async () => {
    const root = await project({
      'package.json': '{"name":"api","dependencies":{"express":"^4.18.0"}}',
      'src/keys.js': "async function find(raw) {\n  return apiKeys.find({ hashedKey: hash(raw) });\n}\nmodule.exports = { find };\n",
    });

    const analysis = await analyzeProject(root);
    expect(analysis.detectors['auth.apiKeys']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });
});

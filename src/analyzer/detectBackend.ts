import type { DetectorResult, DetectorEvidence } from './types';
import { hasDep, hasPyDep, hasAnyPhpDep, type DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';
import { readTextFileSafe } from '../utils/readTextFileSafe';

export async function detectBackend(ctx: DetectContext): Promise<{
  result: DetectorResult;
  frameworks: string[];
}> {
  const frameworks: string[] = [];
  const evidence: DetectorEvidence[] = [];

  // Express
  if (hasDep(ctx, 'express')) {
    frameworks.push('express');
    evidence.push({ type: 'dependency', value: 'express' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => /\.(js|ts|mjs|cjs)$/.test(f)),
      [/require\(['"]express['"]\)/, /from ['"]express['"]/],
      3
    );
    if (matches.length) {
      frameworks.push('express');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // Node backend frameworks detected purely from dependencies.
  //
  // SvelteKit, Remix and Nuxt appear here as well as in the frontend detector, and
  // that is not a mistake: they serve their own routes, so a repository built on one
  // has a backend to be judged even though it also has a UI. Treating them as
  // frontend-only meant an application with server routes, sessions and database
  // access was scored as though it had none of them.
  const nodeFrameworkDeps: Array<[string, string]> = [
    ['next', 'next'],
    ['nestjs', '@nestjs/core'],
    ['fastify', 'fastify'],
    ['hono', 'hono'],
    ['elysia', 'elysia'],
    ['koa', 'koa'],
    ['adonis', '@adonisjs/core'],
    ['sveltekit', '@sveltejs/kit'],
    ['remix', '@remix-run/node'],
    ['remix', '@remix-run/server-runtime'],
    ['nuxt', 'nuxt'],
    ['nitro', 'nitropack'],
  ];
  for (const [framework, dep] of nodeFrameworkDeps) {
    if (hasDep(ctx, dep)) {
      frameworks.push(framework);
      evidence.push({ type: 'dependency', value: dep });
    }
  }

  /**
   * PHP, read from composer.json.
   *
   * A framework here is as conclusive as one in package.json: nobody requires
   * laravel/framework for a reason other than building on Laravel. Plain `php` in the
   * requirements is enough to say the backend is PHP even when the framework is not
   * one of these — which is better than the "unknown" this used to report for a
   * published application with 57 PHP files in it.
   */
  const phpFrameworks: Array<[string, string[]]> = [
    ['laravel', ['laravel/framework', 'laravel/laravel']],
    ['symfony', ['symfony/framework-bundle', 'symfony/symfony']],
    ['slim', ['slim/slim']],
    ['codeigniter', ['codeigniter4/framework']],
    ['cakephp', ['cakephp/cakephp']],
    ['yii', ['yiisoft/yii2']],
  ];

  let namedPhpFramework = false;

  for (const [framework, deps] of phpFrameworks) {
    const hits = hasAnyPhpDep(ctx, deps);
    if (!hits.length) continue;

    namedPhpFramework = true;
    frameworks.push(framework);
    for (const dep of hits) evidence.push({ type: 'dependency', value: dep });
  }

  if (!namedPhpFramework && (hasAnyPhpDep(ctx, ['php']).length > 0 || ctx.files.source.some((f) => f.endsWith('.php')))) {
    frameworks.push('php');
    evidence.push({ type: 'note', value: 'PHP sources with no framework named in composer.json' });
  }

  /**
   * Astro, which is a backend only when it is configured to be one.
   *
   * Astro builds a static site by default and becomes a server when `output` is set
   * to `server` or `hybrid`, or when an adapter is installed. Listing it as a backend
   * unconditionally would be worse than not listing it at all: this tool scores a
   * project against what its kind of product is expected to have, so a static
   * brochure site would start being marked down for missing sessions, tenant
   * isolation and an audit trail it has no reason to want.
   */
  if (hasDep(ctx, 'astro')) {
    const configFile = ctx.files.all.find((f) => /(^|\/)astro\.config\.[cm]?[jt]s$/.test(f));
    const config = configFile ? ((await readTextFileSafe(ctx.root, configFile)) ?? '') : '';
    const servesRequests =
      /output\s*:\s*['"](?:server|hybrid)['"]/.test(config)
      || /adapter\s*:/.test(config)
      || ctx.files.all.some((f) => /(^|\/)src\/pages\/api\//.test(f));

    if (servesRequests) {
      frameworks.push('astro');
      evidence.push({
        type: configFile ? 'file' : 'dependency',
        value: configFile ? `astro configured to serve requests (${configFile})` : 'astro',
        ...(configFile ? { file: configFile } : {}),
      });
    }
  }

  // Python backend frameworks detected purely from dependencies. Django, Flask and
  // FastAPI have their own blocks below because each also has a source-level fallback.
  const pyFrameworkDeps: Array<[string, string]> = [
    ['litestar', 'litestar'],
    ['sanic', 'sanic'],
    ['tornado', 'tornado'],
    ['aiohttp', 'aiohttp'],
    ['starlette', 'starlette'],
  ];
  for (const [framework, dep] of pyFrameworkDeps) {
    if (hasPyDep(ctx, dep)) {
      frameworks.push(framework);
      evidence.push({ type: 'dependency', value: dep });
    }
  }

  // Flask
  if (hasPyDep(ctx, 'flask')) {
    frameworks.push('flask');
    evidence.push({ type: 'dependency', value: 'flask' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from flask import/, /import flask/, /Flask\(__name__\)/],
      3
    );
    if (matches.length) {
      frameworks.push('flask');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // FastAPI
  if (hasPyDep(ctx, 'fastapi')) {
    frameworks.push('fastapi');
    evidence.push({ type: 'dependency', value: 'fastapi' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from fastapi import/, /import fastapi/, /FastAPI\(/, /APIRouter\(/],
      3
    );
    if (matches.length) {
      frameworks.push('fastapi');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // Django
  const djangoSignals: DetectorEvidence[] = [];
  if (ctx.files.all.some((f) => f.endsWith('manage.py') || f === 'manage.py')) {
    djangoSignals.push({ type: 'file', value: 'manage.py' });
  }
  const settingsFile = ctx.files.all.find((f) => f.endsWith('settings.py'));
  if (settingsFile) djangoSignals.push({ type: 'file', value: settingsFile });
  if (hasPyDep(ctx, 'django')) djangoSignals.push({ type: 'dependency', value: 'django' });
  if (ctx.files.all.some((f) => f.endsWith('urls.py'))) {
    djangoSignals.push({ type: 'file', value: ctx.files.all.find((f) => f.endsWith('urls.py'))! });
  }
  if (djangoSignals.length >= 2) {
    frameworks.push('django');
    evidence.push(...djangoSignals);
  }

  return {
    frameworks,
    result: {
      key: 'stack.backend',
      present: frameworks.length > 0,
      evidence,
      details: { frameworks },
    },
  };
}

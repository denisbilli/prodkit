import type { DetectContext } from './detectContext';
import { readTextFileSafe } from '../utils/readTextFileSafe';

/**
 * A settings file that is Django's, rather than one that shares its name.
 *
 * `diet_hub/api/settings.py` is a FastAPI router that lets an administrator change
 * application options from the browser. It was read as Django's configuration, and on
 * the strength of the filename alone the project was credited with having security
 * middleware it does not have — the one direction of error that matters here, because
 * it hides a missing control rather than inventing a present one.
 *
 * Two conditions, because either alone is wrong. A repository can depend on Django and
 * still own a dozen files called settings.py; a file can declare INSTALLED_APPS in a
 * tutorial that the product does not run. And the first file named settings.py is not
 * the right one: a project with `settings/base.py` and `settings/production.py` has
 * several, so every candidate is examined and the first that is Django's is used.
 */
export async function findDjangoSettings(ctx: DetectContext): Promise<{ file: string; text: string } | null> {
  if (!ctx.pythonDeps.includes('django')) return null;

  const candidates = ctx.files.all.filter((f) => /(^|\/)settings(_[a-z]+)?\.py$/i.test(f) || /(^|\/)settings\/[a-z_]+\.py$/i.test(f));
  for (const file of candidates) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;
    if (/^\s*INSTALLED_APPS\s*=/m.test(text) || /^\s*MIDDLEWARE\s*=/m.test(text) || /DJANGO_SETTINGS_MODULE/.test(text)) {
      return { file, text };
    }
  }
  return null;
}

/**
 * The settings module the application actually runs, named by Django's own entry points.
 *
 * `manage.py`, `wsgi.py` and `asgi.py` each set `DJANGO_SETTINGS_MODULE`, and that is
 * the framework saying which configuration is the project's. Everything else called
 * `settings` is somebody's variant: a test harness, a build-time module, a sample.
 *
 * pretix is the measured case. `src/pretix/_build_settings.py` holds
 * `SECRET_KEY = "build-time-secret-key"` and is named only by `src/pretix/_build.py`,
 * a packaging script; `manage.py` and `wsgi.py` both name `pretix.settings`. That
 * literal was the single `critical` in pretix's report — the severity that bars a
 * report from the top band — raised against a line that never serves a request.
 *
 * A name rule could not do this: `configuration_testing.py` was caught by one in
 * 0.80.0, and `_build_settings.py` would need "build" to mean something, which it does
 * not. The entry point is a fact, not a word.
 */
export async function settingsModulesTheAppRuns(ctx: DetectContext): Promise<string[]> {
  const entryPoints = ctx.files.all.filter((file) => /(^|\/)(manage|wsgi|asgi)\.py$/.test(file));
  const modules = new Set<string>();

  for (const file of entryPoints.slice(0, 6)) {
    const text = await readTextFileSafe(ctx.root, file);
    if (!text) continue;

    for (const match of text.matchAll(/DJANGO_SETTINGS_MODULE["'\s,]+["']([\w.]+)["']/g)) {
      modules.add(match[1]);
    }
  }

  if (modules.size === 0) return [];

  const paths: string[] = [];
  for (const module of modules) {
    const asPath = module.replace(/\./g, '/');
    for (const file of ctx.files.all) {
      if (file.endsWith(`${asPath}.py`) || file.endsWith(`${asPath}/__init__.py`)) paths.push(file);
    }
  }

  /**
   * A settings package is loaded whole, through its own imports.
   *
   * `config.settings.production` starts with `from .base import *`, so `base.py` is as
   * much the running configuration as the module named. The first version of this rule
   * excused `base.py` and a fixture written for exactly that shape — a `SECRET_KEY =
   * "changeme"` in the base module — went from `missing` to `passed` in the corpus
   * diff, which is how the mistake surfaced within a minute of making it.
   *
   * Every module beside the named one, inside a directory called `settings`, counts.
   * That is the shape of a split configuration, and it does not reach a sibling of a
   * plain `settings.py` — which is where pretix keeps the build-time module this rule
   * exists to exclude.
   */
  const withSiblings = new Set(paths);
  for (const file of paths) {
    const directory = file.slice(0, file.lastIndexOf('/'));
    if (!/(^|\/)settings$/.test(directory)) continue;

    for (const candidate of ctx.files.all) {
      if (candidate.startsWith(`${directory}/`) && candidate.endsWith('.py')) withSiblings.add(candidate);
    }
  }

  return [...withSiblings];
}

/** Whether a path is the sort of file a Django project keeps its configuration in. */
export function looksLikeDjangoSettings(file: string): boolean {
  return /(^|\/)[\w-]*settings[\w-]*\.py$/i.test(file) || /(^|\/)settings\/[\w-]+\.py$/i.test(file);
}

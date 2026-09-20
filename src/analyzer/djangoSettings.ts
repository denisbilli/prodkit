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

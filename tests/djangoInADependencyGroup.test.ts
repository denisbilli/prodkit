import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

const frameworks = async (name: string) =>
  ((await analyzeProject(fixture(name))).detectors['stack.backend']?.details?.frameworks as string[] | undefined) ?? [];

/**
 * zulip installs Django from `[dependency-groups] prod` and has no `[project]
 * dependencies`. Groups are read as extras — rightly for a library like langchain — so
 * zulip had no Django at all, and the Koa server that renders its KaTeX became its
 * backend.
 */
describe('Django declared in a dependency group', () => {
  it('counts it for an application whose manage.py runs Django', async () => {
    expect(await frameworks('django-in-a-dependency-group')).toContain('django');
  });

  /** redash keeps a Flask `manage.py`; it imports nothing from Django. */
  it('does not count it beside a manage.py that is not Django\'s', async () => {
    expect(await frameworks('flask-manage-py-django-in-a-group')).not.toContain('django');
  });

  /**
   * And zulip's retention: a cutoff of `timedelta(days=realm.message_retention_days)`,
   * compared and deleted further away than the age-and-delete rule looks.
   */
  it('reads a cutoff computed from a retention period as retention', async () => {
    expect((await analyzeProject(fixture('django-in-a-dependency-group'))).detectors['gdpr.retention.job']?.present).toBe(true);
  });
});

import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The caller's own rows, handed over as a file.
 *
 * `sissbruecker/linkding` lets anyone download their bookmarks from `settings/export`:
 * `Bookmark.objects.filter(owner=request.user)` answered with an attachment. The path
 * names no person and the function is called `bookmark_export`, so it was reported as
 * having no data export. The caller and the download are both the framework's words.
 */
describe('the caller takes their data away', () => {
  it('reads a Django view that sends the caller\'s rows as an attachment', async () => {
    const analysis = await analyzeProject(fixture('django-export-my-bookmarks'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(true);
  });

  it('reads Rails\' send_data over current_user\'s association', async () => {
    const analysis = await analyzeProject(fixture('rails-send-my-data'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(true);
  });

  it('reads Laravel\'s download over the caller\'s relation', async () => {
    const analysis = await analyzeProject(fixture('laravel-download-my-data'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(true);
  });

  /**
   * An admin's CSV of every user has the download and not the caller; a page listing the
   * caller's rows has the caller and not the download. Neither is a person taking their
   * data away — nor is a download that reads the caller's CSV delimiter
   * (`delimiter = request.user.config...`, netbox) or asks whether they may
   * (`$request->user()->can(...)`) before exporting everybody's rows.
   */
  it('is not an export of everyone, nor a page of mine', async () => {
    const analysis = await analyzeProject(fixture('an-export-of-everyone-or-a-page-of-mine'));

    expect(analysis.detectors['gdpr.export.route']?.present).toBe(false);
  });
});

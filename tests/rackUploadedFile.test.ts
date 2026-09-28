import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(file: string, content: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-discourse-'));
  await fs.writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n\ngem "rails", "~> 7.2"\n');
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** discourse takes every image and attachment through Rack's uploaded file. */
describe("Rack's uploaded file", () => {
  it('is an upload in Ruby', async () => {
    expect(await uploads('app/controllers/uploads_controller.rb', 'class UploadsController < ApplicationController\n  def create\n    file = params[:file]\n    tempfile = file.tempfile\n    UploadCreator.new(tempfile, file.original_filename).create_for(current_user.id)\n  end\nend\n')).toBe(true);
  });

  it('is not the same word outside Ruby', async () => {
    expect(await uploads('src/cleanup.ts', 'export const cleanup = (job) => job.tempfile && remove(job.tempfile);\n')).toBe(false);
  });
});

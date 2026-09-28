import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(model: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-manyfold-'));
  await fs.writeFile(path.join(root, 'Gemfile'), 'source "https://rubygems.org"\n\ngem "rails", "~> 7.2"\ngem "shrine", "~> 3.10"\n');
  await fs.mkdir(path.join(root, 'app/models'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/models/model_file.rb'), model);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** manyfold stores every uploaded 3D model through Shrine and read as taking no uploads. */
describe("Shrine's attachment", () => {
  it('is an upload', async () => {
    expect(await uploads('class ModelFile < ApplicationRecord\n  include ModelFileUploader::Attachment(:attachment)\nend\n')).toBe(true);
  });

  it('is not a module that is only named Attachment', async () => {
    expect(await uploads('class ModelFile < ApplicationRecord\n  include Concerns::Attachment\n  belongs_to :model\nend\n')).toBe(false);
  });
});

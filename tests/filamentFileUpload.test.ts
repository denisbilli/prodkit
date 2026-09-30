import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(resource: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-wave-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"laravel/framework":"^11.0","filament/filament":"^3.2"}}\n');
  await fs.mkdir(path.join(root, 'app/Filament/Resources/Users'), { recursive: true });
  await fs.writeFile(path.join(root, 'app/Filament/Resources/Users/UserResource.php'), resource);
  const found = (await analyzeProject(root)).detectors['uploads.exposure']?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** wave takes avatars and post images through Filament's FileUpload and read as taking none. */
describe("Filament's FileUpload", () => {
  it('is an upload', async () => {
    expect(await uploads("<?php\nuse Filament\\Forms\\Components\\FileUpload;\n\nclass UserResource\n{\n    public static function form($form)\n    {\n        return $form->schema([FileUpload::make('avatar')->image()]);\n    }\n}\n")).toBe(true);
  });

  it('is not a form of text inputs', async () => {
    expect(await uploads("<?php\nuse Filament\\Forms\\Components\\TextInput;\n\nclass UserResource\n{\n    public static function form($form)\n    {\n        return $form->schema([TextInput::make('name')]);\n    }\n}\n")).toBe(false);
  });
});

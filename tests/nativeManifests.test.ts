import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function project(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-native-'));

  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  return root;
}

describe('gradle', () => {
  it('reads both dialects, and keeps the coordinate without the version', async () => {
    const root = await project({
      'build.gradle': `dependencies {\n  implementation 'androidx.room:room-runtime:2.6.1'\n}\n`,
      'app/build.gradle.kts': `dependencies {\n  implementation("androidx.security:security-crypto:1.1.0")\n  ksp("androidx.room:room-compiler:2.6.1")\n}\n`,
      'app/src/main/AndroidManifest.xml': '<manifest/>\n',
      'app/src/main/Main.kt': 'fun main() {}\n',
    });

    const analysis = await analyzeProject(root);

    // Room is a local database, so this project can open without a network; the
    // security-crypto line is what keeps its token out of a plain file.
    expect(analysis.detectors['mobile.offline']?.present).toBe(true);
    expect(analysis.detectors['mobile.credentialStorage']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });

  it('ignores a version catalog alias rather than reporting it as a library', async () => {
    const root = await project({
      'build.gradle.kts': `dependencies {\n  implementation(libs.androidx.room.runtime)\n}\n`,
      'AndroidManifest.xml': '<manifest/>\n',
    });

    const analysis = await analyzeProject(root);

    // `libs.androidx.room.runtime` names an alias defined in a TOML file. Following it
    // would mean a second reader for a second format; reporting fewer libraries is the
    // right failure, and reporting Room without evidence would be the wrong one.
    expect(analysis.detectors['mobile.offline']?.present).toBe(false);

    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('swift', () => {
  it('reads Package.swift and a Podfile', async () => {
    const root = await project({
      'Package.swift': `// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(\n  name: "App",\n  dependencies: [\n    .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.0.0"),\n  ]\n)\n`,
      'Podfile': `platform :ios, '16.0'\ntarget 'App' do\n  pod 'KeychainAccess'\nend\n`,
      'App/Info.plist': '<plist/>\n',
      'App/App.swift': 'import Foundation\n',
    });

    const analysis = await analyzeProject(root);

    expect(analysis.detectors['mobile.offline']?.present).toBe(true);
    expect(analysis.detectors['mobile.credentialStorage']?.present).toBe(true);

    await fs.rm(root, { recursive: true, force: true });
  });
});

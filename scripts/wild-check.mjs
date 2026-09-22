#!/usr/bin/env node
/**
 * What the fixture corpus cannot tell you.
 *
 * A fixture only contains what somebody wrote into it, so a pattern broad enough to
 * match ordinary code passes the corpus untouched. `destination:\s*\w` did: 0 findings
 * changed across 234 fixtures in both profiles, and three real B2B products came out
 * as marketplaces, because no fixture writes a Next.js redirect.
 *
 * This clones the repositories in `wild-repos.json`, records the profile it infers and
 * the status of every capability, compares that against `wild-baseline.json`, and
 * deletes the sources again. It needs the network, so it is not part of CI; run it
 * before a release that touches a detector.
 *
 *   node scripts/wild-check.mjs                compare against the baseline
 *   node scripts/wild-check.mjs --only=plane   just that one repository
 *   node scripts/wild-check.mjs --write        record the current behaviour as the baseline
 *
 * Clones are deleted as soon as they have been read, but the largest of them are several
 * hundred megabytes and the analysis of one runs beside it. On a machine short of memory
 * the whole set in one go can be killed part-way through; `--only` a few at a time is the
 * way round it, and a killed run leaves its workspace behind under the system temp
 * directory as `prodkit-wild-*`.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const write = process.argv.includes('--write');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

const { repos } = JSON.parse(fs.readFileSync(path.join(here, 'wild-repos.json'), 'utf8'));
const baselinePath = path.join(here, 'wild-baseline.json');
const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'prodkit-wild-'));
const observed = {};
let failures = 0;

try {
  for (const entry of repos) {
    const name = entry.repo.split('/')[1];
    if (only && name !== only) continue;

    const dir = path.join(workspace, name);
    process.stderr.write(`cloning ${entry.repo}\n`);
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `https://github.com/${entry.repo}`, dir], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
    } catch {
      process.stderr.write(`  could not clone ${entry.repo}; skipping\n`);
      continue;
    }

    const out = path.join(workspace, `${name}.json`);
    execFileSync('node', [path.join(root, 'dist', 'index.js'), 'analyze', dir, '--profile', 'auto', '--format', 'json', '--output', out], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const profile = report.productProfile ?? {};

    observed[name] = {
      inferredProfile: profile.inferredProfile ?? null,
      inferenceConfidence: profile.inferenceConfidence ?? null,
      capabilities: Object.fromEntries(
        (profile.capabilities ?? []).map((c) => [c.capabilityId, c.status]),
      ),
    };

    // Delete the source as soon as it has been read. Nothing cloned here is kept.
    fs.rmSync(dir, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

if (write) {
  fs.writeFileSync(baselinePath, `${JSON.stringify({ ...baseline, ...observed }, null, 2)}\n`);
  process.stderr.write(`wrote ${baselinePath}\n`);
  process.exit(0);
}

for (const [name, now] of Object.entries(observed)) {
  const was = baseline[name];
  if (!was) {
    console.log(`${name}: no baseline — run with --write`);
    failures += 1;
    continue;
  }
  if (was.inferredProfile !== now.inferredProfile || was.inferenceConfidence !== now.inferenceConfidence) {
    console.log(`${name}: profile ${was.inferredProfile}/${was.inferenceConfidence} -> ${now.inferredProfile}/${now.inferenceConfidence}`);
    failures += 1;
  }
  for (const key of new Set([...Object.keys(was.capabilities), ...Object.keys(now.capabilities)])) {
    const before = was.capabilities[key] ?? '-';
    const after = now.capabilities[key] ?? '-';
    if (before !== after) {
      console.log(`${name}: ${key} ${before} -> ${after}`);
      failures += 1;
    }
  }
}

console.log(failures === 0 ? 'wild check: no change' : `wild check: ${failures} change(s)`);
process.exit(failures === 0 ? 0 : 1);

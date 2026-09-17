/**
 * Writes the catalogue into the README, between its markers.
 *
 * The list of supported stacks was maintained by hand in three places and had drifted
 * in two of them. This makes the source of truth the detectors, and `npm test` fails
 * if the README was not regenerated after a detector changed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSupportedStacksMarkdown } from '../dist/analyzer/catalogueMarkdown.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(root, 'README.md');

const readme = readFileSync(readmePath, 'utf8');
const start = readme.indexOf('<!-- stacks:start -->');
const end = readme.indexOf('<!-- stacks:end -->');

if (start === -1 || end === -1) {
  console.error('README.md has no <!-- stacks:start --> / <!-- stacks:end --> markers.');
  process.exit(1);
}

const next = readme.slice(0, start) + renderSupportedStacksMarkdown() + readme.slice(end + '<!-- stacks:end -->'.length);

if (next === readme) {
  console.log('README stacks section already current');
} else {
  writeFileSync(readmePath, next);
  console.log('README stacks section updated');
}

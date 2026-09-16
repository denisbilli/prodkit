#!/usr/bin/env node
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Refuses to publish if anything from the commercial AI layer is in dist.
 *
 * `tsc` does not clean its output directory, so a build left over from before the
 * extraction stays on disk and gets packed. That is how the paid layer would ship
 * under MIT without anyone noticing: the source tree is clean, the tests pass, and the
 * tarball is wrong. This check caught exactly that during the extraction.
 */
const FORBIDDEN = [/(^|\/)ai\//, /(^|\/)ai-api\./];
// Importing the SDK is forbidden; naming it is not. detectAiSafety lists it among the
// dependencies it looks for in other people's projects, which is the core doing its
// job — an earlier version of this check flagged that file and was wrong.
const SDK_IMPORT = /(?:require\(|from\s*|import\()\s*["'`]@anthropic-ai\/sdk["'`]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let files;
try {
  files = walk("dist");
} catch {
  console.error("assert-no-ai: dist/ does not exist — run the build first.");
  process.exit(1);
}

const offenders = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));

if (offenders.length > 0) {
  console.error("assert-no-ai: the commercial AI layer is present in dist/ and must not be published:");
  for (const file of offenders) console.error(`  ${file}`);
  console.error("\nRun a clean build and try again.");
  process.exit(1);
}

const mentioning = files
  .filter((file) => file.endsWith(".js"))
  .filter((file) => SDK_IMPORT.test(readFileSync(file, "utf8")));

if (mentioning.length > 0) {
  console.error("assert-no-ai: these built files import the model SDK:");
  for (const file of mentioning) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`assert-no-ai: clean — ${files.length} files, no AI layer.`);

#!/usr/bin/env node
import { runCli } from './cli';

runCli().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`prodkit failed: ${message}`);
  process.exitCode = 1;
});

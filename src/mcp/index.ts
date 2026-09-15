#!/usr/bin/env node
import { startProdkitMcpServer } from './server';

startProdkitMcpServer().catch((error: unknown) => {
  // stdio is the protocol channel, so diagnostics must go to stderr.
  process.stderr.write(`prodkit-mcp failed to start: ${String(error)}\n`);
  process.exit(1);
});

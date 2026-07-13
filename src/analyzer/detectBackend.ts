import type { DetectorResult, DetectorEvidence } from './types';
import { hasDep, hasPyDep, type DetectContext } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

export async function detectBackend(ctx: DetectContext): Promise<{
  result: DetectorResult;
  frameworks: string[];
}> {
  const frameworks: string[] = [];
  const evidence: DetectorEvidence[] = [];

  // Express
  if (hasDep(ctx, 'express')) {
    frameworks.push('express');
    evidence.push({ type: 'dependency', value: 'express' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => /\.(js|ts|mjs|cjs)$/.test(f)),
      [/require\(['"]express['"]\)/, /from ['"]express['"]/],
      3
    );
    if (matches.length) {
      frameworks.push('express');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // Node backend frameworks detected purely from dependencies.
  const nodeFrameworkDeps: Array<[string, string]> = [
    ['next', 'next'],
    ['nestjs', '@nestjs/core'],
    ['fastify', 'fastify'],
  ];
  for (const [framework, dep] of nodeFrameworkDeps) {
    if (hasDep(ctx, dep)) {
      frameworks.push(framework);
      evidence.push({ type: 'dependency', value: dep });
    }
  }

  // Flask
  if (hasPyDep(ctx, 'flask')) {
    frameworks.push('flask');
    evidence.push({ type: 'dependency', value: 'flask' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from flask import/, /import flask/, /Flask\(__name__\)/],
      3
    );
    if (matches.length) {
      frameworks.push('flask');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // FastAPI
  if (hasPyDep(ctx, 'fastapi')) {
    frameworks.push('fastapi');
    evidence.push({ type: 'dependency', value: 'fastapi' });
  } else {
    const matches = await searchInFiles(
      ctx.root,
      ctx.files.source.filter((f) => f.endsWith('.py')),
      [/from fastapi import/, /import fastapi/, /FastAPI\(/, /APIRouter\(/],
      3
    );
    if (matches.length) {
      frameworks.push('fastapi');
      for (const m of matches) {
        evidence.push({ type: 'snippet', value: m.snippet, file: m.file, line: m.line });
      }
    }
  }

  // Django
  const djangoSignals: DetectorEvidence[] = [];
  if (ctx.files.all.some((f) => f.endsWith('manage.py') || f === 'manage.py')) {
    djangoSignals.push({ type: 'file', value: 'manage.py' });
  }
  const settingsFile = ctx.files.all.find((f) => f.endsWith('settings.py'));
  if (settingsFile) djangoSignals.push({ type: 'file', value: settingsFile });
  if (hasPyDep(ctx, 'django')) djangoSignals.push({ type: 'dependency', value: 'django' });
  if (ctx.files.all.some((f) => f.endsWith('urls.py'))) {
    djangoSignals.push({ type: 'file', value: ctx.files.all.find((f) => f.endsWith('urls.py'))! });
  }
  if (djangoSignals.length >= 2) {
    frameworks.push('django');
    evidence.push(...djangoSignals);
  }

  return {
    frameworks,
    result: {
      key: 'stack.backend',
      present: frameworks.length > 0,
      evidence,
      details: { frameworks },
    },
  };
}

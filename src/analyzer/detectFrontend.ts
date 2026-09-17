import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, hasAnyDartDep, type DetectContext } from './detectContext';
import { FRONTEND_FRAMEWORKS } from './catalogue';

export async function detectFrontend(ctx: DetectContext): Promise<{
  result: DetectorResult;
  frameworks: string[];
}> {
  const frameworks: string[] = [];
  const evidence: DetectorEvidence[] = [];

  const reactDeps = hasAnyDep(ctx, ['react', 'react-dom']);
  const viteDeps = hasAnyDep(ctx, ['vite', '@vitejs/plugin-react']);
  if (reactDeps.length) {
    frameworks.push('react');
    for (const d of reactDeps) evidence.push({ type: 'dependency', value: d });
  }
  if (viteDeps.length) {
    frameworks.push('vite');
    for (const d of viteDeps) evidence.push({ type: 'dependency', value: d });
  }

  // Other frontend frameworks detected from their signature dependency.
  for (const [framework, names] of FRONTEND_FRAMEWORKS) {
    const hits = hasAnyDep(ctx, names);
    if (hits.length) {
      frameworks.push(framework);
      for (const d of hits) evidence.push({ type: 'dependency', value: d });
    }
  }

  // Flutter, read from pubspec.yaml. Counted as a front end and deliberately not as a
  // backend: a Flutter application has a user interface and talks to a server that is
  // somewhere else, usually not in this repository at all.
  if (hasAnyDartDep(ctx, ['flutter']).length > 0) {
    frameworks.push('flutter');
    evidence.push({ type: 'dependency', value: 'flutter' });
  }

  const extras = hasAnyDep(ctx, ['react-router-dom', 'axios', 'tailwindcss', 'electron']);
  for (const d of extras) {
    frameworks.push(d);
    evidence.push({ type: 'dependency', value: d });
  }

  return {
    frameworks,
    result: {
      key: 'stack.frontend',
      present: frameworks.length > 0,
      evidence,
      details: { frameworks },
    },
  };
}

import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, type DetectContext } from './detectContext';

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
  const frameworkDeps: Array<[string, string[]]> = [
    ['vue', ['vue']],
    ['nuxt', ['nuxt']],
    ['svelte', ['svelte', '@sveltejs/kit']],
    ['angular', ['@angular/core']],
  ];
  for (const [framework, names] of frameworkDeps) {
    const hits = hasAnyDep(ctx, names);
    if (hits.length) {
      frameworks.push(framework);
      for (const d of hits) evidence.push({ type: 'dependency', value: d });
    }
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

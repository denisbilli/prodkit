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

  /**
   * A page is a front end, whether or not a framework built it.
   *
   * This list only ever held frameworks, so a repository whose product is `index.html`
   * plus a script had no front end, no stack, and a report that called it unreadable
   * and capped its score at 39. Six of them sit in the verification corpus — browser
   * games and small static sites, each one perfectly legible.
   *
   * Recorded only when no framework claimed the project, because saying "react, html"
   * about a React application is noise: every one of them ships an `index.html`.
   */
  if (frameworks.length === 0) {
    const pages = ctx.files.source.filter((file) => /\.html?$/i.test(file));
    if (pages.length > 0) {
      frameworks.push('html');
      for (const page of pages.slice(0, 3)) evidence.push({ type: 'file', value: page, file: page });
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

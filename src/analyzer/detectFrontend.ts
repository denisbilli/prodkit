import type { DetectorResult, DetectorEvidence } from './types';
import { hasAnyDep, hasAnyDartDep, type DetectContext } from './detectContext';
import { FRONTEND_FRAMEWORKS } from './catalogue';
import { searchInFiles } from '../utils/textSearch';

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
   * The user interface a native application actually has.
   *
   * Nothing here could name one, so the question fell through to the fallback below
   * and DuckDuckGo iOS — 1194 Swift files — was reported as "frontend: html", from the
   * error pages and onboarding documents it ships inside the app. A reader sees that
   * line and thinks web application.
   *
   * `import SwiftUI` and `import androidx.compose.runtime` are module imports the
   * platform defines; an author who wants the toolkit has no other way to write it.
   * The frameworks are mutually compatible in practice — an application migrating to
   * SwiftUI still imports UIKit — so all of them that appear are recorded.
   */
  const NATIVE_TOOLKITS: Array<[string, RegExp]> = [
    ['swiftui', /^\s*import\s+SwiftUI\b/m],
    ['uikit', /^\s*import\s+UIKit\b/m],
    ['jetpack compose', /^\s*import\s+androidx\.compose\b/m],
    ['android views', /^\s*import\s+androidx\.appcompat\b|^\s*import\s+android\.app\.Activity\b/m],
  ];

  for (const [toolkit, pattern] of NATIVE_TOOLKITS) {
    const hits = await searchInFiles(ctx.root, ctx.files.source, [pattern], 2);
    if (hits.length === 0) continue;

    frameworks.push(toolkit);
    for (const hit of hits.slice(0, 1)) {
      evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });
    }
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

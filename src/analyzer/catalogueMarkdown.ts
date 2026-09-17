import { supportedStacks } from './catalogue';

/**
 * The catalogue rendered as the README's "Supported stacks" section.
 *
 * Lives in the source rather than in the script that writes it, so a test can render
 * it and compare against the file. That is what keeps the README from drifting: the
 * list is generated, and the check that it was regenerated is part of the suite.
 */
export function renderSupportedStacksMarkdown(): string {
  const catalogue = supportedStacks();

  const line = (label: string, ids: { label: string; detectedFrom?: string }[]) =>
    `- **${label}:** ${ids.map((entry) => entry.label).join(', ')}`;

  const notes = [...catalogue.backend, ...catalogue.mobile, ...catalogue.dataPlatforms]
    .filter((entry) => entry.detectedFrom)
    .map((entry) => `- **${entry.label}** — ${entry.detectedFrom}`);

  return [
    '<!-- stacks:start -->',
    '',
    '_Generated from the analyzer itself — run `npm run docs:stacks` after changing a detector._',
    '',
    line('Backend', catalogue.backend),
    line('Frontend', catalogue.frontend),
    line('Mobile', catalogue.mobile),
    line('Databases', catalogue.databases),
    line('Hosted data platforms', catalogue.dataPlatforms),
    line('ORMs', catalogue.orms),
    '',
    'How some of these are decided:',
    '',
    ...notes,
    '',
    '<!-- stacks:end -->',
  ].join('\n');
}

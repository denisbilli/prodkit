import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { inferProductProfile } from '../src/expectations/inferProductProfile';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);
const infer = async (name: string) => inferProductProfile(await analyzeProject(fixture(name)));

describe('product profile inference', () => {
  it('does not call an ordinary application with a worker an AI SaaS', async () => {
    // Background jobs used to satisfy this branch on their own, and the branch sits
    // ahead of b2b-saas, marketplace and b2c. An ordinary application with a queue was
    // therefore judged against the most demanding profile in the catalogue, and the
    // score came out wrong for a reason the reader could not see.
    //
    // Measured across ten unrelated repositories, five were called ai-saas. One was a
    // pirate game, promoted on a local variable named `queue` inside a flood fill.
    const result = await infer('express-jobs-no-ai');

    expect(result.inferredProfile).not.toBe('ai-saas');
  });

  it('calls a product that depends on a model SDK an AI SaaS', async () => {
    // The other half: narrowing the rule must not empty it.
    const result = await infer('express-model-provider');

    expect(result.inferredProfile).toBe('ai-saas');
  });

  it('reports a model dependency as the thing itself, not as a word in a sentence', async () => {
    const analysis = await analyzeProject(fixture('express-model-provider'));

    expect(analysis.detectors['ai.modelProvider']?.present).toBe(true);
    expect(analysis.detectors['ai.modelProvider']?.evidence?.[0]?.value).toBe('@anthropic-ai/sdk');
  });

  it('claims no model provider for a project without one', async () => {
    const analysis = await analyzeProject(fixture('express-jobs-no-ai'));

    expect(analysis.detectors['ai.modelProvider']?.present).toBe(false);
  });
});

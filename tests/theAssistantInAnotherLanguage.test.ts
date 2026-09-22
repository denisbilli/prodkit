import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The library between the user and the model names itself.
 *
 * `ai.promptSafety` looked for `sanitiz`, `moderation`, `guardrail` and
 * `prompt_injection` — four English words — or a validation library. An assistant
 * written in Italian that routes every incoming question through NeMo Guardrails
 * before it reaches the model has none of the words and was reported as sending
 * unvalidated input to a model.
 *
 * `nemoguardrails` in a requirements file is not a word anybody chose to describe
 * their code. NVIDIA chose it, and it means the same thing in every language.
 */
describe('the assistant in another language', () => {
  it('reads the guardrail off the dependency, not off the word', async () => {
    const report = buildReport(await analyzeProject(fixture('assistente-con-guardrail')), { profile: 'auto' });
    const safety = report.productProfile?.capabilities.find((c) => c.capabilityId === 'ai.prompt-safety');

    expect(safety?.status).toBe('present');
  });

  /**
   * `max_tokens` was already enough for the other half: it is the parameter Anthropic
   * and OpenAI named, not a word the author picked, so a ceiling on the bill reads the
   * same in Italian. This asserts it stays that way.
   */
  it('reads the ceiling on the bill off the provider parameter', async () => {
    const report = buildReport(await analyzeProject(fixture('assistente-con-guardrail')), { profile: 'auto' });
    const cost = report.productProfile?.capabilities.find((c) => c.capabilityId === 'ai.cost-control');

    expect(cost?.status).toBe('present');
  });
});

import type { DetectorEvidence, DetectorResult } from './types';
import type { DetectContext } from './detectContext';
import { hasAnyDep, hasAnyPyDep } from './detectContext';
import { searchInFiles } from '../utils/textSearch';

/**
 * Signals specific to products that call a model provider.
 *
 * These are the two failure modes that are particular to an AI product rather than
 * to software in general: an unbounded bill, because inference costs money per call
 * and a loop or an abusive user turns straight into spend; and unvalidated input
 * reaching a model, which is the AI-specific injection surface.
 */

const MODEL_SDK_DEPS = [
  '@anthropic-ai/sdk',
  'openai',
  '@google/generative-ai',
  'cohere-ai',
  'replicate',
  '@mistralai/mistralai',
  'langchain',
  'ollama',
];

const MODEL_SDK_PY_DEPS = ['anthropic', 'openai', 'google-generativeai', 'cohere', 'replicate', 'langchain', 'litellm'];

function modelDependencies(ctx: DetectContext): string[] {
  return [...hasAnyDep(ctx, MODEL_SDK_DEPS), ...hasAnyPyDep(ctx, MODEL_SDK_PY_DEPS)];
}

async function detectCostControl(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const deps = modelDependencies(ctx);
  for (const dep of deps) evidence.push({ type: 'dependency', value: dep });

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/\bquota/i, /\bcredits?\b/i, /token_?budget/i, /\busage_?limit/i, /max_?tokens/i, /\bspend(ing)?_?limit/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  return {
    key: 'ai.costControl',
    // Only meaningful for a product that actually calls a model.
    present: deps.length > 0 && hits.length > 0,
    evidence,
    details: {
      modelDependency: deps.length > 0,
      costSignals: hits.length,
    },
  };
}

async function detectPromptSafety(ctx: DetectContext): Promise<DetectorResult> {
  const evidence: DetectorEvidence[] = [];
  const deps = modelDependencies(ctx);
  for (const dep of deps) evidence.push({ type: 'dependency', value: dep });

  const validationDeps = hasAnyDep(ctx, ['zod', 'joi', 'yup', 'ajv', 'class-validator']);
  const validationPyDeps = hasAnyPyDep(ctx, ['pydantic', 'marshmallow', 'cerberus']);
  for (const dep of [...validationDeps, ...validationPyDeps]) {
    evidence.push({ type: 'dependency', value: dep });
  }

  const hits = await searchInFiles(
    ctx.root,
    ctx.files.source,
    [/prompt_?injection/i, /\bsanitiz/i, /\bmoderation/i, /system_?prompt/i, /\bguardrail/i],
    20,
  );
  for (const hit of hits) evidence.push({ type: 'snippet', value: hit.snippet, file: hit.file, line: hit.line });

  const hasValidation = validationDeps.length + validationPyDeps.length > 0;

  return {
    key: 'ai.promptSafety',
    present: deps.length > 0 && (hits.length > 0 || hasValidation),
    evidence,
    details: {
      modelDependency: deps.length > 0,
      inputValidation: hasValidation,
      safetySignals: hits.length,
    },
  };
}

export async function detectAiSafety(ctx: DetectContext): Promise<DetectorResult[]> {
  return Promise.all([detectCostControl(ctx), detectPromptSafety(ctx)]);
}

import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfileInference } from './types';

export function inferProductProfile(analysis: ProjectAnalysis): ProductProfileInference {
  const backendPresent = analysis.stack.backend.length > 0;
  const frontendPresent = analysis.stack.frontend.length > 0;
  const dbPresent = analysis.stack.databases.length > 0;

  const auth = analysis.detectors['auth.core']?.present === true;
  const billing = analysis.detectors['billing.stripe']?.present === true;
  const tenancy = analysis.detectors['tenancy.organization']?.present === true || analysis.detectors['tenancy.membership']?.present === true;
  const jobs = analysis.detectors['jobs.background']?.present === true;
  const uploads = analysis.detectors['uploads.exposure']?.present === true;

  /**
   * A dependency on a model SDK, not a word that suggests one.
   *
   * This used to match /openai|anthropic|claude|gemini|llm|transcrib|generation|prompt|model/
   * against the evidence strings of the billing, API-key and background-job detectors.
   * "model" is in every ORM, "generation" and "prompt" are ordinary English, and the
   * strings being searched were written to describe something else entirely.
   */
  const callsAModel = analysis.detectors['ai.modelProvider']?.present === true;

  const sourceHints = analysis.files.source.join('\n');
  const marketplaceHints = /seller|buyer|vendor|listing|order/i.test(sourceHints);
  const adminHints = /admin|\/users|subscription|billing/i.test(sourceHints);

  /**
   * A static site is content. An application that happens to run entirely in the
   * browser is not one, and this branch used to call it one with high confidence — then
   * apply the profile that expects almost nothing, and report that it was fine.
   *
   * "No backend" was being read as "no application", but a client-side application has
   * no backend by design: a calculator, an editor, a simulator, a visualisation tool.
   * Measured across eleven repositories, two were caught this way — a factory simulator
   * with a domain model, and a CAD application with a 3D renderer and a state store.
   *
   * This failure runs the other way from the ones it sits beside. It does not demand
   * too much of a project; it demands nothing, which is harder to notice and worse to
   * act on.
   */
  const clientLogic = analysis.detectors['stack.clientLogic']?.present === true;

  if (frontendPresent && !backendPresent && !dbPresent && !auth) {
    if (!clientLogic) {
      return { inferredProfile: 'static-site', confidence: 'high', reason: 'Frontend-only structure with no backend/db/auth signals.' };
    }

    return {
      inferredProfile: 'client-app',
      confidence: 'medium',
      reason: 'A front end holding state and logic with no backend: an application that runs in the browser.',
    };
  }

  /**
   * Background jobs used to be sufficient here, in `(aiEvidence || jobs)`. They are
   * orthogonal: every serious application has a queue, and this branch sits second,
   * ahead of b2b-saas, marketplace and b2c — so an ordinary application with a worker
   * was judged against the most demanding profile in the catalogue, which accumulates
   * roughly 185 points of expectation. The score came out wrong for a reason the
   * reader had no way to see.
   *
   * Measured: of ten unrelated local repositories, five were called ai-saas. One was a
   * pirate game, promoted on a local variable named `queue` in a flood fill.
   */
  if (callsAModel && (uploads || jobs || backendPresent)) {
    return {
      inferredProfile: 'ai-saas',
      confidence: 'medium',
      reason: 'A model SDK dependency with a backend or a processing pipeline.',
    };
  }

  if (marketplaceHints && billing) {
    return { inferredProfile: 'marketplace', confidence: 'medium', reason: 'Marketplace vocabulary and billing signals detected.' };
  }

  if (billing || tenancy || adminHints) {
    return { inferredProfile: 'b2b-saas', confidence: billing || tenancy ? 'high' : 'medium', reason: 'Billing/tenant/admin signals are consistent with B2B SaaS.' };
  }

  if (auth && !tenancy) {
    return { inferredProfile: 'b2c-app', confidence: 'medium', reason: 'Auth signals without tenant boundaries suggest consumer app.' };
  }

  /**
   * No profile. Not `internal-tool`.
   *
   * There used to be a branch here for a deliberate internal tool —
   * `backendPresent && auth && !billing && !tenancy` — and an exhaustive search over
   * its inputs returns zero combinations that reach it: anything with auth and no
   * tenancy has already returned b2c-app, and anything with billing or tenancy has
   * already returned b2b-saas. It was dead code, so every internal-tool ever reported
   * came from the fallback below and meant "I do not know".
   *
   * A positive signal for an internal tool is worth designing — enterprise identity
   * with no public signup and no billing is the shape of one — but inventing the
   * distinction without evidence is what produced a wrong profile on five of ten real
   * repositories. Until there is evidence, the answer is nothing.
   */
  /**
   * Nothing conclusive. Before giving up, say what it looks like.
   *
   * No single game signal is a game: a renderer is a product configurator, a frame loop
   * is any animated interface, a realtime transport is a chat. Three of them together
   * are a reasonable suspicion. The threshold is measured rather than chosen — across
   * eleven real repositories the only one reaching three is a multiplayer board game,
   * and a CAD application, which is precisely the false positive to fear, sits at two
   * with a renderer and a frame loop.
   *
   * Commerce disqualifies: something selling subscriptions or separating tenants is
   * being judged on those, whatever else it draws on a canvas.
   */
  const game = analysis.detectors['game.engine'];
  const signals = Number(game?.details?.supportingSignals ?? 0);

  if (signals >= 3 && !billing && !tenancy) {
    const named = [
      game?.details?.supporting ? `renderer (${(game.details.supporting as string[]).join(', ')})` : null,
      game?.details?.frameLoop ? 'a frame loop' : null,
      (game?.details?.realtime as string[] | undefined)?.length ? 'realtime multiplayer' : null,
      (game?.details?.assetScripts as string[] | undefined)?.length ? 'an asset pipeline' : null,
    ].filter(Boolean);

    return {
      inferredProfile: null,
      confidence: 'low',
      reason: 'No profile-specific evidence: the repository does not identify what kind of product it is.',
      suggestion: {
        profile: 'game',
        reason: `This looks like a game — ${named.join(', ')} — but nothing here proves it. Re-run with --profile game to judge it as one.`,
      },
    };
  }

  /**
   * A tool with a backend and nothing to sell.
   *
   * Suggested rather than inferred, unlike the browser-only shape. There the evidence
   * is positive — state and logic, measured. Here it is the absence of billing, tenancy
   * and accounts, and an absence is a weaker thing to build a judgement on: it is also
   * what an unfinished B2B SaaS looks like three weeks in.
   */
  if (backendPresent && !billing && !tenancy && !auth && analysis.files.source.length > 12) {
    return {
      inferredProfile: null,
      confidence: 'low',
      reason: 'A backend with no accounts, tenants or billing: nothing here says what kind of product it is.',
      suggestion: {
        profile: 'client-app',
        reason:
          'This looks like a tool people use rather than a product with accounts to manage — no sign-up, nothing to bill, no tenants to separate. Re-run with --profile client-app to judge it as one.',
      },
    };
  }

  return {
    inferredProfile: null,
    confidence: 'low',
    reason: 'No profile-specific evidence: the repository does not identify what kind of product it is.',
  };
}
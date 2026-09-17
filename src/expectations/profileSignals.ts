import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfile } from './types';

/**
 * Profiles are scored, not matched in order.
 *
 * The cascade this replaces read as a list of rules and behaved as a priority list,
 * which is a difference that does not announce itself. Three defects in one night came
 * from it, all the same shape: the `internal-tool` branch was unreachable and an
 * exhaustive search was needed to notice; `ai-saas` sat second and claimed five
 * unrelated repositories; and the `game` suggestion went silent the moment `client-app`
 * was added above it.
 *
 * None of those is possible here. Every profile is scored against the same facts, so
 * adding one cannot quieten another, an unreachable rule cannot exist, and the runner-up
 * — which the cascade had to be told about by hand, twice — falls out for free.
 *
 * Confidence is derived from the margin rather than written into each branch. It used
 * to be a literal: whoever wrote the rule decided how sure the tool was, in advance,
 * for every repository it would ever see.
 */

/** Everything a rule is allowed to look at, read once. */
export interface ProfileFacts {
  backend: boolean;
  frontend: boolean;
  database: boolean;
  auth: boolean;
  billing: boolean;
  tenancy: boolean;
  adminSurface: boolean;
  marketplaceVocabulary: boolean;
  callsAModel: boolean;
  jobs: boolean;
  uploads: boolean;
  clientLogic: boolean;
  gameEngine: boolean;
  gameSignals: number;
  sourceFiles: number;
}

export function readFacts(analysis: ProjectAnalysis): ProfileFacts {
  const sourceHints = analysis.files.source.join('\n');
  const present = (key: string): boolean => analysis.detectors[key]?.present === true;

  return {
    backend: analysis.stack.backend.length > 0,
    frontend: analysis.stack.frontend.length > 0,
    database: analysis.stack.databases.length > 0,
    auth: present('auth.core'),
    billing: present('billing.stripe'),
    tenancy: present('tenancy.organization') || present('tenancy.membership'),
    adminSurface: /admin|\/users|subscription|billing/i.test(sourceHints),
    marketplaceVocabulary: present('marketplace.multiRole'),
    callsAModel: present('ai.modelProvider'),
    jobs: present('jobs.background'),
    uploads: present('uploads.exposure'),
    clientLogic: present('stack.clientLogic'),
    gameEngine: present('game.engine'),
    gameSignals: Number(analysis.detectors['game.engine']?.details?.supportingSignals ?? 0),
    sourceFiles: analysis.files.source.length,
  };
}

interface Signal {
  /** Named, because it is printed as the reason the profile won. */
  label: string;
  weight: number;
  holds: (f: ProfileFacts) => boolean;
}

interface ProfileRule {
  profile: ProductProfile;
  /**
   * The profile this one is a special case of.
   *
   * Profiles are not a flat set: an AI SaaS is a B2B SaaS that calls models, a game is
   * a client application that is played. Scored flat, the general one wins whenever it
   * shares the specific one's evidence and adds any of its own — which is how a
   * transcription SaaS came out as b2b-saas and a multiplayer game as client-app.
   *
   * Declared rather than implied by ordering, because ordering is what this whole
   * rewrite exists to remove. A specialisation wins only when it clears the floor on
   * its own evidence; it never inherits a claim it did not earn.
   */
  refines?: ProductProfile;
  /**
   * Without this the profile does not compete at all. Not a weight: a marketplace
   * without a backend is not a weak marketplace, it is not one.
   */
  admissible: (f: ProfileFacts) => boolean;
  signals: Signal[];
}

/**
 * Weights are deliberately coarse — 3 for something that nearly settles the question,
 * 2 for strong evidence, 1 for a hint, negative for evidence against. Finer numbers
 * would imply a precision that thirteen calibration repositories do not support, and
 * would invite tuning against them one by one.
 */
/**
 * Weights are coarse on purpose — 3 for something that nearly settles the question, 2
 * for strong evidence, 1 for a hint, negative for evidence against. Finer numbers would
 * imply a precision that thirteen calibration repositories cannot support, and would
 * invite tuning against them one at a time until the numbers describe the corpus
 * instead of the world.
 *
 * Two rules learned by getting this wrong on the first attempt.
 *
 * Scores are absolute, not normalised. Dividing by what a profile could have earned
 * rewarded narrowness: `b2c-app` has three signals, so accounts plus a front end maxed
 * it out and beat a `b2b-saas` holding four of seven. The question is how much evidence
 * there is, not what fraction of a short list it fills.
 *
 * An absence is never evidence for. "No billing, no tenants, no accounts" was worth
 * three points towards a client application, which is also an exact description of an
 * empty repository. Absences appear only as negative weights, where they belong.
 */
const RULES: ProfileRule[] = [
  {
    profile: 'static-site',
    admissible: (f) => f.frontend && !f.backend && !f.database && !f.auth,
    signals: [
      { label: 'a front end with no backend, database or sign-in', weight: 3, holds: () => true },
      // What stopped a factory simulator being called a brochure site.
      { label: 'state and logic in the browser', weight: -4, holds: (f) => f.clientLogic },
    ],
  },
  {
    profile: 'client-app',
    admissible: (f) => f.frontend || f.backend,
    signals: [
      { label: 'state and logic in the browser', weight: 3, holds: (f) => f.clientLogic },
      { label: 'enough code to be an application', weight: 1, holds: (f) => f.sourceFiles > 12 },
      { label: 'subscriptions', weight: -3, holds: (f) => f.billing },
      { label: 'tenant boundaries', weight: -3, holds: (f) => f.tenancy },
      { label: 'accounts to manage', weight: -1, holds: (f) => f.auth },
    ],
  },
  {
    profile: 'game',
    refines: 'client-app',
    admissible: (f) => (f.gameEngine || f.gameSignals >= 3) && !f.billing && !f.tenancy,
    signals: [
      { label: 'a game engine', weight: 5, holds: (f) => f.gameEngine },
      { label: 'a renderer, a frame loop, multiplayer and an asset pipeline', weight: 4, holds: (f) => !f.gameEngine && f.gameSignals >= 3 },
    ],
  },
  {
    profile: 'ai-saas',
    refines: 'b2b-saas',
    admissible: (f) => f.callsAModel && f.backend,
    signals: [
      { label: 'a model SDK', weight: 3, holds: (f) => f.callsAModel },
      { label: 'a backend to call it from', weight: 1, holds: (f) => f.backend },
      { label: 'a processing pipeline', weight: 1, holds: (f) => f.jobs || f.uploads },
      { label: 'accounts', weight: 1, holds: (f) => f.auth },
    ],
  },
  {
    profile: 'marketplace',
    refines: 'b2b-saas',
    admissible: (f) => f.marketplaceVocabulary,
    signals: [
      { label: 'two sides to a transaction', weight: 3, holds: (f) => f.marketplaceVocabulary },
      { label: 'money moving', weight: 2, holds: (f) => f.billing },
      { label: 'accounts', weight: 1, holds: (f) => f.auth },
    ],
  },
  {
    profile: 'b2b-saas',
    admissible: (f) => f.backend || f.billing || f.tenancy,
    signals: [
      { label: 'tenant boundaries', weight: 4, holds: (f) => f.tenancy },
      { label: 'subscriptions', weight: 3, holds: (f) => f.billing },
      { label: 'an administrative surface', weight: 1, holds: (f) => f.adminSurface },
      { label: 'accounts', weight: 1, holds: (f) => f.auth },
    ],
  },
  {
    profile: 'b2c-app',
    admissible: (f) => f.auth && f.backend,
    signals: [
      { label: 'accounts on a backend', weight: 3, holds: () => true },
      { label: 'a front end', weight: 1, holds: (f) => f.frontend },
      { label: 'tenant boundaries', weight: -4, holds: (f) => f.tenancy },
    ],
  },
];

export interface ProfileScore {
  profile: ProductProfile;
  /** Points earned. Absolute, so more evidence beats a shorter list filled up. */
  score: number;
  reasons: string[];
}

export function scoreProfiles(facts: ProfileFacts, floor = 3): ProfileScore[] {
  const scored = RULES
    .filter((rule) => rule.admissible(facts))
    .map((rule) => {
      const holding = rule.signals.filter((signal) => signal.holds(facts));
      const earned = holding.reduce((total, signal) => total + signal.weight, 0);

      return {
        profile: rule.profile,
        score: Math.max(0, earned),
        reasons: holding.filter((s) => s.weight > 0).map((s) => s.label),
      };
    })
    .sort((a, b) => b.score - a.score);

  /**
   * A specialisation that earned its place outranks what it refines. Applied after
   * scoring rather than during it, so the general profile keeps its own score and stays
   * visible as the runner-up — which is usually the right second opinion.
   */
  const byProfile = new Map(scored.map((entry) => [entry.profile, entry]));

  return [...scored].sort((a, b) => {
    const aRefinesB = RULES.find((r) => r.profile === a.profile)?.refines === b.profile;
    const bRefinesA = RULES.find((r) => r.profile === b.profile)?.refines === a.profile;

    if (aRefinesB && a.score >= floor) return -1;
    if (bRefinesA && b.score >= floor) return 1;

    return b.score - a.score;
  }).map((entry) => byProfile.get(entry.profile) ?? entry);
}

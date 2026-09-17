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
  passwordReset: boolean;
  emailVerification: boolean;
  socialLogin: boolean;
  realtime: boolean;
  apiSurface: boolean;
  containerised: boolean;
  gameEngine: boolean;
  gameSignals: number;
  /** Ships to a phone: Flutter, React Native, or an iOS/Android project in the tree. */
  mobilePlatforms: string[];
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
    passwordReset: present('auth.passwordReset'),
    emailVerification: present('auth.emailVerification'),
    socialLogin: present('auth.social') || present('auth.oauth'),
    realtime: (analysis.detectors['game.engine']?.details?.realtime as string[] | undefined ?? []).length > 0,
    apiSurface: /\/api\//.test(sourceHints) || present('auth.apiKeys'),
    containerised: present('deployment.docker'),
    gameEngine: present('game.engine'),
    gameSignals: Number(analysis.detectors['game.engine']?.details?.supportingSignals ?? 0),
    mobilePlatforms: (analysis.detectors['mobile.platform']?.details?.platforms as string[] | undefined) ?? [],
    sourceFiles: analysis.files.source.length,
  };
}

interface Signal {
  /** Named, because it is printed as the reason the profile won. */
  label: string;
  weight: number;
  /**
   * Whether this signal says what kind of product it is, rather than how complete an
   * example of that kind it is.
   *
   * The distinction matters because confidence rests on it. A consumer product without
   * self-service password recovery is still certainly a consumer product — what it is
   * missing is a capability, and the report has a whole section for saying so. Counting
   * that absence against the classification made the tool sound unsure about something
   * it had identified correctly, and quietly turned an unfinished product into an
   * unrecognised one.
   *
   * Identifying signals decide confidence. The rest still earn points, because they do
   * make the case stronger when present, but they cannot make the tool doubt itself.
   */
  identifies?: boolean;
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
      { identifies: true, label: 'a front end with no backend, database or sign-in', weight: 3, holds: () => true },
      // What stopped a factory simulator being called a brochure site.
      { identifies: true, label: 'state and logic held by the application itself', weight: -4, holds: (f) => f.clientLogic },
    ],
  },
  {
    profile: 'client-app',
    admissible: (f) => f.frontend || f.backend,
    signals: [
      { identifies: true, label: 'state and logic held by the application itself', weight: 3, holds: (f) => f.clientLogic },
      { label: 'enough code to be an application', weight: 1, holds: (f) => f.sourceFiles > 12 },
      { label: 'a substantial codebase', weight: 1, holds: (f) => f.sourceFiles > 40 },
      { label: 'an API of its own', weight: 1, holds: (f) => f.apiSurface },
      { label: 'shipped as a container', weight: 1, holds: (f) => f.containerised },
      { identifies: true, label: 'subscriptions', weight: -3, holds: (f) => f.billing },
      { identifies: true, label: 'tenant boundaries', weight: -3, holds: (f) => f.tenancy },
      { label: 'accounts to manage', weight: -1, holds: (f) => f.auth },
    ],
  },
  {
    /**
     * A mobile application refines client-app for the same reason `game` does: it is a
     * client, and the expectations that separate it are ones no web application has.
     *
     * The platform is what identifies it, and one signal is enough — a repository with
     * an AndroidManifest.xml is an Android application, and no amount of other evidence
     * makes it less one. What the rest of the signals do is separate a real app from a
     * web project that happens to carry a Capacitor shell.
     */
    profile: 'mobile-app',
    refines: 'client-app',
    admissible: (f) => f.mobilePlatforms.length > 0 && !f.tenancy,
    signals: [
      { identifies: true, label: 'a mobile project in the repository', weight: 5, holds: (f) => f.mobilePlatforms.length > 0 },
      {
        identifies: true,
        label: 'built for both iOS and Android',
        weight: 1,
        holds: (f) => f.mobilePlatforms.includes('ios') && f.mobilePlatforms.includes('android'),
      },
      { label: 'enough code to be an application', weight: 1, holds: (f) => f.sourceFiles > 12 },
      // A backend in the same repository does not stop it being a mobile app, but a
      // repository that is mostly a server with a thin client is a server.
      { label: 'a server of its own in the same repository', weight: -1, holds: (f) => f.backend && f.database },
    ],
  },
  {
    profile: 'game',
    refines: 'client-app',
    admissible: (f) => (f.gameEngine || f.gameSignals >= 3) && !f.billing && !f.tenancy,
    signals: [
      { identifies: true, label: 'a game engine', weight: 5, holds: (f) => f.gameEngine },
      { identifies: true, label: 'a renderer, a frame loop, multiplayer and an asset pipeline', weight: 4, holds: (f) => !f.gameEngine && f.gameSignals >= 3 },
      { label: 'realtime multiplayer', weight: 1, holds: (f) => f.realtime },
      { label: 'progress to save', weight: 1, holds: (f) => f.clientLogic },
    ],
  },
  {
    profile: 'ai-saas',
    refines: 'b2b-saas',
    admissible: (f) => f.callsAModel && f.backend,
    signals: [
      { identifies: true, label: 'a model SDK', weight: 3, holds: (f) => f.callsAModel },
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
      { identifies: true, label: 'two sides to a transaction', weight: 3, holds: (f) => f.marketplaceVocabulary },
      { label: 'money moving', weight: 2, holds: (f) => f.billing },
      { label: 'accounts', weight: 1, holds: (f) => f.auth },
    ],
  },
  {
    profile: 'b2b-saas',
    admissible: (f) => f.backend || f.billing || f.tenancy,
    signals: [
      { identifies: true, label: 'tenant boundaries', weight: 4, holds: (f) => f.tenancy },
      { identifies: true, label: 'subscriptions', weight: 3, holds: (f) => f.billing },
      { label: 'an administrative surface', weight: 1, holds: (f) => f.adminSurface },
      { label: 'accounts', weight: 1, holds: (f) => f.auth },
      { label: 'an API of its own', weight: 1, holds: (f) => f.apiSurface },
    ],
  },
  {
    profile: 'b2c-app',
    admissible: (f) => f.auth && f.backend,
    signals: [
      { identifies: true, label: 'accounts on a backend', weight: 3, holds: () => true },
      { label: 'a front end', weight: 1, holds: (f) => f.frontend },
      // The shape of consumer sign-up, which a B2B product invited by an admin does
      // not need: people arrive on their own and lose their passwords.
      { label: 'self-service password recovery', weight: 2, holds: (f) => f.passwordReset },
      { label: 'email verification', weight: 1, holds: (f) => f.emailVerification },
      { label: 'social sign-in', weight: 1, holds: (f) => f.socialLogin },
      { label: 'user uploads', weight: 1, holds: (f) => f.uploads },
      { identifies: true, label: 'tenant boundaries', weight: -4, holds: (f) => f.tenancy },
    ],
  },
];

export interface ProfileScore {
  profile: ProductProfile;
  /** Points earned. Absolute, so more evidence beats a shorter list filled up. */
  score: number;
  /**
   * How much of this profile's own evidence is present, 0-1.
   *
   * Separate from `score` because they answer different questions. `score` ranks
   * profiles against each other; saturation says how complete the case is, and that is
   * what confidence should rest on. Judging confidence by absolute points instead meant
   * a profile whose maximum was 4 could never be reported with high confidence, however
   * perfectly it matched — which is precisely what happened to two correctly identified
   * client applications scoring 4 out of 4.
   */
  saturation: number;
  reasons: string[];
  refines?: ProductProfile;
}

export function scoreProfiles(facts: ProfileFacts, floor = 3): ProfileScore[] {
  const scored = RULES
    .filter((rule) => rule.admissible(facts))
    .map((rule) => {
      const holding = rule.signals.filter((signal) => signal.holds(facts));
      const earned = holding.reduce((total, signal) => total + signal.weight, 0);

      // Only identifying signals. Saturation answers "how sure are we what this is",
      // and a missing capability is not an argument about identity.
      const identifying = rule.signals.filter((signal) => signal.identifies && signal.weight > 0);
      const available = identifying.reduce((t, x) => t + x.weight, 0);
      const earnedIdentifying = identifying.filter((signal) => signal.holds(facts)).reduce((t, x) => t + x.weight, 0);

      return {
        profile: rule.profile,
        score: Math.max(0, earned),
        saturation: available === 0 ? 0 : Math.max(0, earnedIdentifying) / available,
        reasons: holding.filter((s) => s.weight > 0).map((s) => s.label),
        refines: rule.refines,
      };
    })
    .sort((a, b) => b.score - a.score);

  /**
   * A specialisation that earned its place is promoted above what it refines.
   *
   * Done as an explicit move rather than inside the comparator. The first version put
   * the rule in `sort`, which asks a comparator to describe a total order — and "a
   * refines b" is not one: it is not transitive, and a comparator that is not consistent
   * gives results the specification does not define. It showed: a transcription SaaS
   * came out with ai-saas at 6 in front and b2b-saas at 9 in third place.
   */
  const ordered = [...scored];

  for (const entry of scored) {
    if (!entry.refines || entry.score < floor) continue;

    const generalIndex = ordered.findIndex((other) => other.profile === entry.refines);
    const specificIndex = ordered.findIndex((other) => other.profile === entry.profile);

    if (generalIndex === -1 || specificIndex <= generalIndex) continue;

    ordered.splice(specificIndex, 1);
    ordered.splice(generalIndex, 0, entry);
  }

  return ordered;
}

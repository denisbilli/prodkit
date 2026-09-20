import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfile } from './types';
import { DOCS_DIRECTORIES } from '../analyzer/detectPackaging';

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
  /**
   * A backend somebody else runs: Supabase, Firebase, Appwrite and their kind.
   *
   * Kept apart from `backend` because the two mean different things to an expectation.
   * The product has accounts and a database either way, which is what decides its
   * profile; who is responsible for the rate limit is a separate question.
   */
  managedBackend: boolean;
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
  /** A manifest that names and versions this, so something else can depend on it. */
  publishable: boolean;
  /**
   * The front end in this repository is its documentation, not its product.
   *
   * zod, axios, vite and ruff were all read from their docs sites: five public libraries
   * out of five, none identified as a library. The site that documents a product is not
   * the product.
   */
  documentationSite: boolean;
  /**
   * A server the product ships, as distinct from one its documentation or playgrounds run.
   *
   * zod's only workspace with a backend is `packages/docs`. vite's are ten directories
   * under `playground/`. Both were excluded from the `library` profile by a backend
   * neither of them ships.
   */
  productBackend: boolean;
  /** Somewhere for a consumer to import: main, module, exports, bin, a console script. */
  entrypoints: boolean;
  packagedLicense: boolean;
  tests: boolean;
  gameSignals: number;
  /** Ships to a phone: Flutter, React Native, or an iOS/Android project in the tree. */
  mobilePlatforms: string[];
  /**
   * How much of the repository the mobile project is, between 0 and 1.
   *
   * A true signal about one project was being read as a fact about the whole: eShop's
   * MAUI client is 137 source files of 515, beside a web application and eight services,
   * and the repository came back as a phone application.
   */
  mobileShare: number;
  sourceFiles: number;
}


/**
 * Whether any backend in this repository belongs to the product.
 *
 * A workspace under `docs/`, `playground/` or `examples/` that runs a server is running
 * it to demonstrate or test something. vite has ten such workspaces, every one of them
 * an Express server, and none of them vite.
 *
 * Where no workspace declares a backend but the repository does, the signal came from
 * the root and belongs to the product: there is nowhere else for it to come from.
 */
function hasProductBackend(analysis: ProjectAnalysis): boolean {
  if (analysis.stack.backend.length === 0) return false;

  const withBackend = analysis.workspaceStacks.filter((workspace) => workspace.backend.length > 0);
  if (withBackend.length === 0) return true;

  return withBackend.some((workspace) => !DOCS_DIRECTORIES.test(`${workspace.root}/`));
}

export function readFacts(analysis: ProjectAnalysis): ProfileFacts {
  const sourceHints = analysis.files.source.join('\n');
  const present = (key: string): boolean => analysis.detectors[key]?.present === true;
  const complete = (key: string): boolean => analysis.detectors[key]?.complete === true;

  return {
    backend: analysis.stack.backend.length > 0,
    managedBackend: analysis.stack.dataPlatforms.length > 0,
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
    publishable: complete('packaging.manifest'),
    documentationSite: present('docs.site'),
    productBackend: hasProductBackend(analysis),
    entrypoints: present('packaging.entrypoints'),
    packagedLicense: present('packaging.license'),
    tests: present('quality.tests'),
    gameSignals: Number(analysis.detectors['game.engine']?.details?.supportingSignals ?? 0),
    mobilePlatforms: (analysis.detectors['mobile.platform']?.details?.platforms as string[] | undefined) ?? [],
    mobileShare: (analysis.detectors['mobile.platform']?.details?.sourceShare as number | undefined) ?? 0,
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
      /**
       * Two readings of the same identity, in one signal.
       *
       * This profile's own description is "an application someone uses to do something,
       * without accounts to manage or subscriptions to sell", and only the first half
       * of that was ever checked: logic held in the browser. Six repositories in the
       * verification corpus had a backend, a front end and over a hundred source files
       * between them, scored two against a floor of three, and were reported as
       * unidentifiable.
       *
       * They are one signal rather than two because they are alternative descriptions
       * of one thing, not evidence that accumulates. Saturation divides what a profile
       * earned by what it could earn, so adding a second identifying signal quietly
       * halved the confidence of every browser application that matched the first — a
       * test written one release ago caught it.
       *
       * A model called from its own backend is excluded for the same reason it is
       * penalised below: that is an AI product, and this profile would otherwise
       * outrank the one that says so.
       */
      {
        identifies: true,
        label: 'an application in its own right, with nothing to sign in to',
        weight: 3,
        holds: (f) => f.clientLogic
          || (f.frontend && f.backend && !f.auth && !f.billing && !f.tenancy && !f.callsAModel),
      },
      { label: 'enough code to be an application', weight: 1, holds: (f) => f.sourceFiles > 12 },
      { label: 'a substantial codebase', weight: 1, holds: (f) => f.sourceFiles > 40 },
      { label: 'an API of its own', weight: 1, holds: (f) => f.apiSurface },
      { label: 'shipped as a container', weight: 1, holds: (f) => f.containerised },
      { identifies: true, label: 'subscriptions', weight: -3, holds: (f) => f.billing },
      { identifies: true, label: 'tenant boundaries', weight: -3, holds: (f) => f.tenancy },
      /**
       * A client application does not run a model server.
       *
       * Weighted like subscriptions and tenant boundaries, and for the same reason: when
       * a repository calls a model from a backend it owns, the expectations worth
       * judging it against are the ones about prompts, cost and safety, not the ones
       * about a client holding its own state. A site that animates a canvas and also
       * runs two LLM services was read as a browser application the moment a render
       * loop counted in its favour — and being judged by the more general profile
       * raised its score from 59 to 75.
       */
      { identifies: true, label: 'a model called from its own backend', weight: -3, holds: (f) => f.callsAModel && f.backend },
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
    /**
     * The mobile project has to be the repository, not a project inside it.
     *
     * Every repository in the corpus that is a phone application has its manifest at the
     * root and scores 1. eShop scores 0.27 and is a .NET system with a MAUI client in it.
     * Half is the line, and it sits in the gap between those two rather than in the
     * middle of a distribution.
     */
    /**
     * A tenant word in a client model is not a tenant boundary.
     *
     * WordPress-iOS carries `organizationID` in `RemoteBlog.swift` and
     * `RemoteReaderSiteInfo.swift` — data classes deserialised from WordPress.com's
     * JSON. The application consumes an organization; it does not host one, and it
     * could not: enforcing a boundary between tenants takes a server, and this is
     * 2649 Swift files with none.
     *
     * It was excluded from the mobile profile on that word and judged as a B2B SaaS,
     * which asked it for a health endpoint, security headers and a GDPR export
     * route. Tenancy still disqualifies a phone application that ships a server
     * alongside it, because then the boundary is the repository's to keep.
     */
    admissible: (f) =>
      f.mobilePlatforms.length > 0
      && f.mobileShare >= 0.5
      && !(f.tenancy && f.productBackend),
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
    /**
     * A package other people install, and the command-line tools packaged the same way.
     *
     * A quarter of the verification corpus received no profile, and much of it was
     * this. What separates a library from an application is not its size or its
     * language: it is that a library declares where it starts. `main`, `bin`, `exports`
     * or a console script is a statement that something else is meant to import this —
     * and the web applications in the corpus, whose manifests are just as complete,
     * declare none of them, because nobody imports a Next.js site.
     *
     * A front end or a backend framework disqualifies it outright. Those are how a
     * project serves requests, and a package is not served.
     */
    profile: 'library',
    /**
     * A front end that is documentation does not make a package an application.
     *
     * The gate used to be "no front end at all", which is right for a plain package and
     * wrong for every library with a docs site — which is to say, every library anybody
     * has heard of. A backend still disqualifies: a package is not served.
     */
    admissible: (f) =>
      f.publishable
      && f.entrypoints
      && (!f.frontend || f.documentationSite)
      && !f.productBackend
      && f.mobilePlatforms.length === 0,
    signals: [
      { identifies: true, label: 'a manifest that names and versions it', weight: 3, holds: (f) => f.publishable },
      { identifies: true, label: 'an entry point for something else to import', weight: 2, holds: (f) => f.entrypoints },
      { label: 'a licence that permits use', weight: 1, holds: (f) => f.packagedLicense },
      { label: 'tests', weight: 1, holds: (f) => f.tests },
      /**
       * Subscriptions and tenant boundaries are not counted against a package, though
       * every application profile counts them against the others.
       *
       * They mean something different here. A payments library talks about payments and
       * is still a library; the words are its subject matter, not its business model.
       * The gate that keeps an application out of this profile is the absence of a
       * backend and a front end — a package is not served — and that gate does the work
       * on its own.
       *
       * This analyzer is the case that made it obvious: it contains the patterns it
       * searches for, so it found STRIPE_WEBHOOK_SECRET and `organization` in its own
       * detector tables, was penalised six points for them, and ended up with no
       * profile at all. Any linter, scanner or security tool would fare the same.
       */
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
    /**
     * Software as a service has to be reachable to be a service.
     *
     * Billing or tenant vocabulary alone used to be enough, so a repository with
     * neither a server nor a user interface could be reported as a B2B SaaS. This
     * analyzer did exactly that to itself: it contains the patterns it searches for, so
     * it found `STRIPE_WEBHOOK_SECRET` and `organization` in its own detector tables
     * and called itself a SaaS at 97/100. It is a command-line package.
     */
    admissible: (f) => (f.backend || f.frontend) && (f.backend || f.billing || f.tenancy),
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
    /**
     * A backend somebody else runs is still a backend.
     *
     * Two consumer applications in the verification corpus — accounts, a Postgres
     * database, user data — received no profile at all because their server is
     * Supabase's rather than their own. Nothing about what the product is depends on
     * where the server is hosted.
     */
    admissible: (f) => f.auth && (f.backend || f.managedBackend),
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

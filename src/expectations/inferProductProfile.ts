import type { ProjectAnalysis } from '../analyzer/types';
import type { ProductProfileInference } from './types';
import { readFacts, scoreProfiles } from './profileSignals';

/**
 * How sure the tool is, derived rather than declared.
 *
 * Every branch of the cascade this replaces carried its confidence as a literal —
 * whoever wrote the rule decided, in advance, how sure the tool would be about every
 * repository it would ever see. Here it comes from two things that are actually
 * measured: how much of a profile's evidence is present, and how far ahead of the
 * runner-up it is. A repository that looks equally like two products is one the tool
 * is not sure about, and now says so by arithmetic rather than by assertion.
 */
const FLOOR = 3;
const CLEAR_MARGIN = 2;
/**
 * A share of the profile's own evidence, not a number of points.
 *
 * This was 5 absolute points, chosen without checking what each profile could reach.
 * Two profiles topped out at 4, so a repository matching one of them perfectly was
 * reported at medium confidence — the ceiling sat below the bar.
 */
const COMFORTABLE = 0.7;

export function inferProductProfile(analysis: ProjectAnalysis): ProductProfileInference {
  const facts = readFacts(analysis);
  const ranked = scoreProfiles(facts);
  const [winner] = ranked;

  if (!winner || winner.score < FLOOR) {
    /**
     * Nothing scored well enough. The runner-up is still worth naming: saying "this
     * looks like a game, run it as one" costs nothing and changes no number, while
     * applying a profile on this much evidence is exactly what went wrong before.
     */
    const best = ranked[0];

    return {
      inferredProfile: null,
      confidence: 'low',
      reason: 'No profile-specific evidence: the repository does not identify what kind of product it is.',
      ...(best && best.score >= 2
        ? {
          suggestion: {
            profile: best.profile,
            reason: `This looks like ${best.profile} — ${best.reasons.join(', ')} — but nothing here proves it. Re-run with --profile ${best.profile} to judge it as one.`,
          },
        }
        : {}),
    };
  }

  // Measured against the best reading that is not simply a more general version of the
  // winner: b2b-saas scoring higher than the ai-saas that refines it is agreement, not
  // competition, and treating it as a rival made every AI product look uncertain.
  const rival = ranked.slice(1).find((entry) => entry.profile !== winner.refines);
  const margin = winner.score - (rival?.score ?? 0);

  const confidence = winner.saturation >= COMFORTABLE && margin >= CLEAR_MARGIN
    ? 'high'
    : winner.saturation >= COMFORTABLE || margin >= CLEAR_MARGIN
      ? 'medium'
      : 'low';

  return {
    inferredProfile: winner.profile,
    confidence,
    reason: `${winner.reasons.join(', ')}.`,
    // The second-best reading, when it is close enough to be worth a second look. This
    // used to be hand-written for one profile at a time; it is now every profile's, for
    // free, and it is what a reader needs to disagree with the first.
    ...(rival && margin < CLEAR_MARGIN
      ? {
        suggestion: {
          profile: rival.profile,
          reason: `It could also be ${rival.profile} — ${rival.reasons.join(', ')}. Re-run with --profile ${rival.profile} to judge it as one.`,
        },
      }
      : {}),
  };
}

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
const COMFORTABLE = 5;

export function inferProductProfile(analysis: ProjectAnalysis): ProductProfileInference {
  const facts = readFacts(analysis);
  const ranked = scoreProfiles(facts);
  const [winner, runnerUp] = ranked;

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

  const margin = winner.score - (runnerUp?.score ?? 0);
  const confidence = winner.score >= COMFORTABLE && margin >= CLEAR_MARGIN
    ? 'high'
    : margin >= CLEAR_MARGIN || winner.score >= COMFORTABLE
      ? 'medium'
      : 'low';

  return {
    inferredProfile: winner.profile,
    confidence,
    reason: `${winner.reasons.join(', ')}.`,
    // The second-best reading, when it is close enough to be worth a second look. This
    // used to be hand-written for one profile at a time; it is now every profile's, for
    // free, and it is what a reader needs to disagree with the first.
    ...(runnerUp && margin < CLEAR_MARGIN
      ? {
        suggestion: {
          profile: runnerUp.profile,
          reason: `It could also be ${runnerUp.profile} — ${runnerUp.reasons.join(', ')}. Re-run with --profile ${runnerUp.profile} to judge it as one.`,
        },
      }
      : {}),
  };
}
